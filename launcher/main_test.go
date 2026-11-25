package main

import (
 "bytes"
 "encoding/json"
 "io"
 "net/http"
 "net/http/cookiejar"
 "net/http/httptest"
 "os"
 "path/filepath"
 "strings"
 "testing"
)

func TestCookieBasedNativeLogin(t *testing.T) {
 upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter,r *http.Request){
  if r.Header.Get("Origin")!="http://backend.test" { // covered below using actual upstream origin
   // The actual base URL is dynamic and must match the request Host.
   if r.Header.Get("Origin")!="http://"+r.Host {t.Errorf("bad origin: %s",r.Header.Get("Origin"))}
  }
  switch r.URL.Path {
  case "/api/login":
   if !strings.Contains(r.Header.Get("Content-Type"),"application/json") {t.Error("missing content type")}
   http.SetCookie(w,&http.Cookie{Name:"asira_session",Value:"session-abc",Path:"/",HttpOnly:true})
   w.Header().Set("Content-Type","application/json")
   _,_=w.Write([]byte(`{"ok":true,"csrf":"abc123"}`))
  case "/api/desktop/access":
   c,err:=r.Cookie("asira_session");if err!=nil||c.Value!="session-abc"{w.WriteHeader(401);_,_=w.Write([]byte(`{"error":"No session"}`));return}
   _,_=w.Write([]byte(`{"ok":true}`))
  default: http.NotFound(w,r)
  }
 }))
 defer upstream.Close()
 jar,_:=cookiejar.New(nil)
 client:=&http.Client{Jar:jar}
 localOrigin:="http://127.0.0.1:9999"
 handler,err:=proxyHandler(upstream.URL,localOrigin,client)
 if err!=nil {t.Fatal(err)}
 local:=httptest.NewServer(handler);defer local.Close()
 req,_:=http.NewRequest("POST",local.URL+"/api/login",bytes.NewBufferString(`{"code":"ABCD"}`))
 req.Header.Set("Origin",localOrigin);req.Header.Set("Content-Type","application/json")
 resp,err:=http.DefaultClient.Do(req)
 if err!=nil{t.Fatal(err)}
 _=resp.Body.Close()
 if resp.StatusCode!=200 {t.Fatalf("login HTTP %d",resp.StatusCode)}
 req2,_:=http.NewRequest("GET",local.URL+"/api/desktop/access",nil)
 resp2,err:=http.DefaultClient.Do(req2)
 if err!=nil{t.Fatal(err)}
 defer resp2.Body.Close()
 content,_:=io.ReadAll(resp2.Body)
 if resp2.StatusCode!=200||string(content)!=`{"ok":true}` {t.Fatalf("cookie was not preserved: status=%d body=%s",resp2.StatusCode,content)}
}
func TestExternalWebsitePostBlocked(t *testing.T){
 jar,_:=cookiejar.New(nil)
 h,err:=proxyHandler("https://example.org","http://127.0.0.1:9999",&http.Client{Jar:jar})
 if err!=nil{t.Fatal(err)}
 s:=httptest.NewServer(h);defer s.Close()
 req,_:=http.NewRequest("POST",s.URL+"/api/login",strings.NewReader(`{}`))
 req.Header.Set("Origin","https://malicious.example")
 resp,err:=http.DefaultClient.Do(req);if err!=nil{t.Fatal(err)};defer resp.Body.Close()
 if resp.StatusCode!=403 {t.Fatalf("expected 403, got %d",resp.StatusCode)}
}
func TestLastJsonOnlyServerChanged(t *testing.T){
 dir:=t.TempDir();file:=filepath.Join(dir,"Last.json")
 err:=os.WriteFile(file,[]byte(`{"server":"https://old.example","values":{"ClickGUI":{"Scale":85},"Account":{"name":"Asira"}}}`),0600);if err!=nil{t.Fatal(err)}
 if err:=updateServer(file,"http://127.0.0.1:9999");err!=nil{t.Fatal(err)}
 b,_:=os.ReadFile(file);var obj map[string]interface{}
 if err:=json.Unmarshal(b,&obj);err!=nil{t.Fatal(err)}
 if obj["server"]!="http://127.0.0.1:9999"{t.Fatal("url was not updated")}
 v:=obj["values"].(map[string]interface{})
 if v["ClickGUI"].(map[string]interface{})["Scale"]!=float64(85){t.Fatal("original settings lost")}
}
