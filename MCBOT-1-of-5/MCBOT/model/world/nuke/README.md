# Nuke

- `index.js` — Nukeの開始・停止、設定の適用。Desktopから呼び出されます。
- `settings.js` — 設定画面の値、XYZ範囲・床・足場・ItemDropの設定と入力チェック。

採掘の実行は既存のWorkerに任せています。通常の採掘と共有するブロック破壊、床、足場の処理は `model/world/mining/` にあります。Nuke固有の処理はこのフォルダに追加します。
