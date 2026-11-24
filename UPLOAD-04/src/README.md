# MCBOT ソース構成


| 変更したいもの | 場所 |
|---|---|
| Nukeの開始・停止と設定 | `model/world/nuke/` |
| 採掘、床、足場の共有処理 | `model/world/mining/` |
| MobAura、KillAura、クリスタル、索敵、防御 | `model/combat/` の機能別フォルダ |
| Circle、Follow、移動経路 | `model/movement/` |
| 装備、補給、アイテム操作 | `model/inventory/` |
| チャット、挨拶、AI | `model/chat/` |
| 外見、座標 | `model/player/` |
| サーバー固有の操作 | `model/server/` |
| Web API、セッション、画面の配信 | `web/server/` |
| ブラウザで使うHTML、CSS、JS | `web/` |
| Desktopからの操作と連携 | `desktop/bridge/` |
| Windows版の画面とC++コード | `desktop-native/` |
| Discordの起動とコマンド | `discord/bot/` |
| 設定の読み書きとバックアップ | `data/` |
| Microsoft認証、Bedrock通信、診断 | `src/auth/`、`src/bedrock/`、`src/diagnostics/` |
| Botの起動・管理 | `src/index.js`、`src/app/` |

機能を追加するときは、対応する機能フォルダに実装を置き、呼び出し元から読み込みます。専用の設定や補助処理がある場合は、Nukeのように同じフォルダにまとめます。
Railwayの実データは引き続き環境変数やボリュームで指定された場所に保存されます。ソースに設定データや認証キャッシュを入れる必要はありません。
