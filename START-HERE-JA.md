# v0.3.9 最初に読む

## 既存のRailwayを更新する

1. ZIPを解凍します。
2. AsiraClearBotフォルダの**中身**を既存GitHubリポジトリへ上書きします。src・web・vendor・scripts・package.json・package-lock.json・Dockerfileを含めます。
3. Railwayの新しいデプロイが成功するまで待ちます。Variablesとdataは引き継ぎます。
4. 起動ログとWeb右上がv0.3.9か確認します。WebはCtrl+F5で更新してください。

認証を残すため、MCBOTにVolumeを接続し、Mount Path=/data・DATA_DIR=/dataとします。DATA_DIRだけの設定ではVolumeは作成されません。

## WebからBot1を認証して接続する

1. Discordで /web を実行し、本人専用リンクを開きます。
2. Bot1を選択。必要なら「Minecraftアカウント」で正確なゲーマータグを保存します。
3. ログイン・接続を押し、コードが出たら https://www.microsoft.com/link で入力します。
4. Bot用アカウントでサインインすると、Minecraftへの接続を自動で開始します。
5. 同じ画面で接続の段階・失敗理由を確認できます。再試行・キャンセルもここから操作します。次からは保存した認証を再利用し、失効した場合だけ再認証します。

初回でまだWebのURLがない場合は、RailwayのMCBOT→Settings→Networking→Generate Domainを使い、生成されたhttpsのURLをDiscordの /web url: に設定します。HTTPポートはPORT（未指定なら3000）です。

## ローカルで動かす

Node.js 24を入れ、.env.exampleを.envにコピーしてDISCORD_TOKEN等を設定します。作業フォルダで npm ci → npm start。DATA_DIRには保存先フォルダを指定してください。自分のPCからUDPでサーバーへ通信できる環境が必要です。

## 確認しながら操作する

最初はBot1だけで接続・アイテム移動・食事・歩行を確認してください。Webの「装備」で手動操作した後、AutoSlotは30秒待機します。「停止」は移動と戦闘を止めます。「音をテスト」で音を確認できます。

使えない操作があれば、実行直後に「状態レポート」を保存してください。操作待ち・サーバー確認・地形・飲食・PA・Jetpackのどこで止まっているかを記録します。

詳しくはUPDATE-v0.3.9-JA.mdとWEB-GUIDE-JA.mdを参照してください。
