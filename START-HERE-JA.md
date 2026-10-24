# v0.3.17 最初に読む

## 既存のRailwayを更新

1. ZIPを解凍します。
2. `AsiraClearBot` フォルダの中身を既存GitHubへ上書きします。`src`・`web`・`vendor`・`scripts`・`package.json`・`package-lock.json`・Dockerfileを含めます。
3. Railwayのデプロイ成功後、起動ログとWeb右上の `v0.3.17` を確認します。古いWebが残る場合はCtrl+F5で更新します。
4. この版で一度「接続」を押します。次からは接続希望も保存され、バックエンド再起動時に保存認証で再接続します。

既存の保存データ・Variablesは維持します。IDのVariablesを新たに設定する必要はありません。

## ログインを残す準備

MCBOTにRailway Volumeを接続し、Mount Pathを `/data`、DATA_DIRを `/data` にします。DATA_DIRだけではVolumeは作成されません。既存のデータが別の保存先にある場合は、消さずにバックアップして移行してください。

Webの更新・タブを閉じる操作ではMinecraftを切断しません。Webログインは同じ公開ドメイン・同じブラウザで保持されます。Cookieを削除した時などは再ログインします。再デプロイ中のMinecraft接続は一度切れ、その後再接続します。

## Webでアカウントを追加・接続

1. Discordの `/web` から開き、「Discordでログイン」を使います。
2. 初回の空の一覧なら「＋アカウント追加」を押し、正確なゲーマータグと接続先を選んで追加します。既存のアカウントは一覧をそのまま使えます。
3. Botを1体選び「ログイン・接続」。コードが出たらコピーし、Microsoft公式ページでBot用のアカウントにサインインします。
4. 認証が終わるとMinecraftへ接続します。失敗時は同じ画面の理由を確認します。次回は保存認証を使い、失効した場合だけ再認証します。

Minecraftのゲーマータグ・グリーター対象のIDはWebへ入力します。`BOT_NAMES`・`IGN_BOT_NAME`・`GREET_TARGET_ID` のVariables設定は不要です。IGNの接続先IP・ポートは引き続き `IGN_HOST`・`IGN_PORT` を設定します。

WebのURLがまだなければ、RailwayのMCBOT → Settings → Networking → Generate Domain。生成されたHTTPSのURLをDiscordの `/web url:` に保存します。WebのポートはPORT、未指定なら3000です。

## よく使う場所

- グリーター：対象Botを選ぶ → チャット → グリーターの「設定を開く」→ 対象ID・文章・ONを保存。
- IGN World：移動 → IGN専用操作 → World名 `cpe` → 実行。送信コマンドは `/world cpe`。
- 全員ON/OFF：グループを選ぶ → 各機能の「⋯」。
- 見た目：設定 → テーマ・壁紙・操作音。
- 接続を止める：「切断」。Webを閉じる操作と違い、再起動時の自動再接続も止めます。
- 不具合：操作を1回試し、「状態レポート」を保存します。

詳しくは [更新ガイド](UPDATE-v0.3.17-JA.md) と [Web操作](WEB-GUIDE-JA.md) を参照してください。
