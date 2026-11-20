package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

const upstream = "https://mcbot-asira.up.railway.app"

// The original Windows/C++ ClickGUI executable is embedded and launched unchanged
// except for its *default API root*. The proxy adds the HTTP session cookie that
// the previously compiled native GUI does not persist by itself.
//
//go:embed native_original.exe
var embeddedFS embed.FS

func main() {
	if err := run(); err != nil {
		// Windows GUI subsystem hides stderr. Store a small diagnostic, never token data.
		base, e := os.UserConfigDir()
		if e == nil {
			dir := filepath.Join(base, "AsiraNative")
			_ = os.MkdirAll(dir, 0700)
			_ = os.WriteFile(filepath.Join(dir, "launcher-error.txt"), []byte(err.Error()+"\n"), 0600)
		}
	}
}

func run() error {
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		return fmt.Errorf("cannot listen on loopback: %w", err)
	}
	defer listener.Close()
	localURL := "http://" + listener.Addr().String()
	jar, _ := cookiejar.New(nil)
	client := &http.Client{Timeout: 45 * time.Second, Jar: jar, CheckRedirect: func(req *http.Request, via []*http.Request) error { return http.ErrUseLastResponse }}
	handler, err := proxyHandler(upstream, localURL, client)
	if err != nil {
		return err
	}
	server := &http.Server{Handler: handler, ReadHeaderTimeout: 6 * time.Second, IdleTimeout: 60 * time.Second}
	go func() { _ = server.Serve(listener) }()
	defer server.Shutdown(context.Background())

	original, err := embeddedFS.ReadFile("native_original.exe")
	if err != nil {
		return err
	}
	oldURL := []byte("https://mcbot-production-b2fb.up.railway.app")
	at := bytes.Index(original, oldURL)
	if at < 0 || bytes.Count(original, oldURL) != 1 {
		return errors.New("Original C++ executable URL marker not found")
	}
	if len(localURL) > len(oldURL) {
		return errors.New("Loopback URL does not fit native executable")
	}
	patched := bytes.Clone(original)
	copy(patched[at:at+len(oldURL)], make([]byte, len(oldURL)))
	copy(patched[at:], []byte(localURL))

	launcher, err := os.Executable()
	if err != nil {
		return err
	}
	directory := filepath.Dir(launcher)
	engine, err := writeEngine(directory, patched)
	if err != nil {
		configDir, e := os.UserConfigDir()
		if e != nil {
			return err
		}
		directory = filepath.Join(configDir, "AsiraNative", "engine")
		engine, err = writeEngine(directory, patched)
		if err != nil {
			return err
		}
	}
	defer os.Remove(engine)
	// Preserve ALL other settings: only temporarily point the C++ login at the proxy.
	cfg := filepath.Join(directory, "config", "Last.json")
	_ = updateServer(cfg, localURL)
	defer updateServer(cfg, upstream)
	cmd := exec.Command(engine)
	cmd.Dir = directory
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("starting original native GUI: %w", err)
	}
	err = cmd.Wait()
	if err != nil {
		return fmt.Errorf("native GUI exited: %w", err)
	}
	return nil
}

// proxyHandler forwards native GUI requests through a cookie-aware loopback proxy.
// The upstream HTTPS server remains the only server receiving credentials.
func proxyHandler(baseURL, localURL string, client *http.Client) (http.Handler, error) {
	target, err := url.Parse(baseURL)
	if err != nil {
		return nil, err
	}
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		if r.URL.Path != "/health" && !strings.HasPrefix(r.URL.Path, "/api/") {
			http.Error(w, `{"error":"Unsupported local endpoint"}`, http.StatusNotFound)
			return
		}
		// An unrelated web page cannot issue authenticated cross-site POST requests.
		if r.Method != "GET" && r.Header.Get("Origin") != localURL {
			writeJSONError(w, http.StatusForbidden, "Blocked external-origin request")
			return
		}
		if !isLocal(r.RemoteAddr) {
			writeJSONError(w, http.StatusForbidden, "Only loopback requests are accepted")
			return
		}
		if r.ContentLength > 4*1024*1024 {
			writeJSONError(w, http.StatusRequestEntityTooLarge, "Request too large")
			return
		}
		p := *target
		p.Path = r.URL.Path
		p.RawQuery = r.URL.RawQuery
		body := http.MaxBytesReader(w, r.Body, 4*1024*1024)
		defer body.Close()
		outgoing, err := http.NewRequestWithContext(r.Context(), r.Method, p.String(), body)
		if err != nil {
			writeJSONError(w, 502, "Could not build upstream request")
			return
		}
		for k, vals := range r.Header {
			if strings.EqualFold(k, "Cookie") || strings.EqualFold(k, "Origin") || strings.EqualFold(k, "Host") || strings.EqualFold(k, "Accept-Encoding") || strings.EqualFold(k, "Connection") {
				continue
			}
			for _, v := range vals {
				outgoing.Header.Add(k, v)
			}
		}
		outgoing.Header.Set("Origin", baseURL)
		outgoing.Header.Set("Accept", "application/json")
		reply, err := client.Do(outgoing)
		if err != nil {
			writeJSONError(w, 502, "Railway unreachable: "+err.Error())
			return
		}
		defer reply.Body.Close()
		// Cookie is intentionally kept *only* in the proxy's in-memory cookie jar.
		for k, vals := range reply.Header {
			switch strings.ToLower(k) {
			case "set-cookie", "content-encoding", "content-length", "connection", "transfer-encoding", "access-control-allow-origin":
				continue
			}
			for _, v := range vals {
				w.Header().Add(k, v)
			}
		}
		content, err := io.ReadAll(io.LimitReader(reply.Body, 16*1024*1024+1))
		if err != nil {
			writeJSONError(w, 502, "Could not read Railway response")
			return
		}
		if len(content) > 16*1024*1024 {
			writeJSONError(w, 502, "Railway response too large")
			return
		}
		if reply.StatusCode >= 400 {
			var payload map[string]interface{}
			if json.Unmarshal(content, &payload) == nil {
				if _, ok := payload["error"].(string); !ok {
					reason, ok := payload["message"].(string)
					if !ok || reason == "" {
						reason = fmt.Sprintf("Railway HTTP %d", reply.StatusCode)
					}
					payload["error"] = reason
					content, _ = json.Marshal(payload)
				}
			} else {
				reason := fmt.Sprintf("Railway returned HTTP %d", reply.StatusCode)
				if len(bytes.TrimSpace(content)) == 0 {
					reason += " with an empty response"
				}
				writeJSONError(w, reply.StatusCode, reason)
				return
			}
		}
		w.WriteHeader(reply.StatusCode)
		_, _ = w.Write(content)
	})
	return handler, nil
}

func isLocal(remote string) bool {
	host, _, err := net.SplitHostPort(remote)
	return err == nil && net.ParseIP(host).IsLoopback()
}
func writeJSONError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"ok": false, "error": message})
}
func writeEngine(dir string, content []byte) (string, error) {
	if err := os.MkdirAll(dir, 0700); err != nil {
		return "", err
	}
	sig := sha256.Sum256(content)
	name := fmt.Sprintf("Asira-Native-Original-%x-%d.exe", sig[:4], os.Getpid())
	path := filepath.Join(dir, name)
	if err := os.WriteFile(path, content, 0700); err != nil {
		return "", err
	}
	return path, nil
}
func updateServer(file, newURL string) error {
	b, err := os.ReadFile(file)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	var document map[string]interface{}
	if err := json.Unmarshal(b, &document); err != nil {
		return err
	}
	document["server"] = newURL
	newContent, err := json.MarshalIndent(document, "", "  ")
	if err != nil {
		return err
	}
	temp := file + ".asira.tmp"
	if err := os.WriteFile(temp, newContent, 0600); err != nil {
		return err
	}
	return os.Rename(temp, file)
}
