# Nuke

- `index.js` — Nukeの開始・停止、設定の適用。Desktopから呼び出されます。
- `settings.js` — 設定画面の値、XYZ範囲・床・足場・ItemDropの設定と入力チェック。

採掘の実行は既存のWorkerに任せています。通常の採掘と共有するブロック破壊、床、足場の処理は `model/world/mining/` にあります。Nuke固有の処理はこのフォルダに追加します。

## 設定

- **LavaMode** をONにすると、耐火対策ができる場合に溶岩を通る経路を使います。OFFでもすでに溶岩に入ったBotは脱出を試みます。MovementのLavaWalkがOFFの場合も採掘経路では溶岩を避けます。
- **Chunk Break** をONにすると、入力したX/Z範囲が触れるチャンク全体に採掘範囲を広げます。Y範囲とブロックの指定はそのまま使います。OFFにすると入力したX/Zの範囲を使います。
