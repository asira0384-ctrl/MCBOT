# v0.3.12 / ログインと装備・操作画面

GitHubへZIPの中身を上書きし、Railwayの新しいデプロイ完了後にWebをCtrl+F5で更新してください。Dockerfile・web・src・package.json・package-lock.jsonも含めて更新します。起動ログとWebの表示が **v0.3.12** になったことを確認します。

## DiscordでWebにログイン

1. [Discord Developer Portal](https://discord.com/developers/applications)で、今のDiscord Botのアプリを開きます。
2. OAuth2のClient ID・Client SecretをRailway Variablesの `DISCORD_CLIENT_ID`・`DISCORD_CLIENT_SECRET` に保存します。Client SecretとBot Tokenは別です。
3. OAuth2のRedirectsに `https://あなたのRailway公開ドメイン/oauth/discord/callback` を追加して保存します。自分の公開ドメインに置き換え、末尾まで完全一致にします。
4. `WEB_BASE_URL=https://あなたのRailway公開ドメイン` を設定します。Railwayの公開ドメインからの自動取得、またはAsiraの `/web url:...` も使えます。
5. デプロイ後、AsiraがDiscordで `/webaccess add user:@許可する人` を実行します。その人はWebの「Discordでログイン」から操作できます。プロフィールはDiscordが返す実際のアイコン・表示名・IDを表示します。

`/webaccess list` で一覧、`/webaccess remove user:@対象` で取り消します。取り消した人の開いているWebと既存セッションも操作を拒否します。Asira本人は常に利用可能です。許可の管理・DiscordのBot管理コマンド・暗号化バックアップの出力と復元はAsira本人だけです。許可されたメンバーはWebからBotを操作し、Discordの `/web` でURLを開けます。

Discordログイン未設定の間は、従来のAsira本人専用・一度限りのリンクも残しています。

## Microsoft認証

単体Botを選ぶ → 正確なゲーマータグを保存 →「Microsoft認証／ログイン・接続」。出たコードは「コードをコピー」でコピーできます。認証の成功と保存を確認するとダイアログを自動で閉じ、接続状況は一覧で確認できます。失敗時は閉じません。

認証キャッシュはBot番号から分離し、アカウントごとの固定の識別子で保存します。既存の番号別キャッシュも移します。認証済みアカウントを別のBot枠に設定しても同じ保存認証を使います。別アカウントへの変更は「ゲーマータグを保存」から行えます。Microsoft側の失効や再認証要求がある場合はサインインが必要です。

## 保存と引っ越し

RailwayのVolumeを接続し、Mount Pathを `/data`、`DATA_DIR=/data` に設定します。`DATA_DIR` が未設定ならVolumeのMount Pathを使います。認証・敵・フレンド・許可リスト・設定・Webセッションをその保存先へ書き込みます。古いサービスに残っていたデータは、新しい空のVolumeへ自動的には現れません。

別のサービス／PCへ移す時は、Web「設定」→「アカウントと設定のバックアップ」から10文字以上のパスワードで暗号化して保存します。移動先でDiscord設定を済ませ、全Botと認証中の処理を切断・キャンセルしてから、同じファイルとパスワードで復元してください。移動先のWeb URLと現在のWebセッションは保持し、バックアップにはWebセッションを含めません。

ファイルにはMicrosoftの認証キャッシュが暗号化されて入っています。公開GitHubへアップロードせず保管してください。Volumeがないままデプロイすると実行環境のファイルが消えるため、コードだけでは認証を永久保存できません。

## Webの見た目・音

本文は通常の太さ、見出しとボタンだけ強調するデザインへ変更しました。「設定」で壁紙PNG/JPEG/WebP、操作音・通知音MP3/OGG/WAVを変更できます。各ファイル8MBまで。背景の暗さ・音量・標準の音色も選べます。Discordユーザーごとにサーバーへ保存します。上の「操作音」「通知」でON/OFFします。ブラウザで一度操作し、画面を開いている間に音を鳴らします。ブラウザの通知許可が拒否されていればOS通知は出ません。

## IGN Bot11だけの機能

Webの装備タブでBot11を選ぶと、AutoKit・AutoTPA・AutoBackと手動ボタンが出ます。サーバーから自分のリスポーンと生存を確認した後に、Kit → Back → TPAの順に、有効なものだけ実行します。キューの初期spawnでは実行しません。各コマンドの実際の権限とKit名はIGN側に従います。

| 内容（Discordの /bot のcommand欄） | 動作 |
| --- | --- |
| autokit on kit名 / autokit off | リスポーン後に `/kit kit名` |
| autotp on Player One / autotp off | リスポーン後に `/tpa "Player One"` |
| autoback on / autoback off | リスポーン後に `/back` |
| kit kit名 / tpa Player One / back | 今すぐ手動実行 |
| follow Player One / follow off | 受信したプレイヤーの足跡をたどる／停止 |
| follow distance 2 | 追従の間隔を変更 |
| autolog mode pop | Totemが割れた時に切断 |
| autolog mode empty | 一度持ったTotemが、インベントリとオフハンドを合わせて0個になった時に切断 |
| autolog mode health | Totem数に関わらず、設定体力以下で切断 |
| autolog mode empty-health | 従来の「Totem残り0 ＋ 設定体力以下」 |
| autolog on 4 / autolog off | AutoLog有効・ハート数設定／無効 |

追従は移動タブからも開始できます。対象の実際に受信した曲がり角を記憶し、最初から最新位置へ直進する動作を避けます。未受信の場所・対象のテレポート・別ディメンションは連続した足跡として扱いません。

## 装備・補充・戦闘の変更

- ホットバー外の黒曜石を使う時に剣の1番枠へ入れる問題を修正。剣・ピッケル・食料を他の設置物で押し出さない枠選択に変更しました。
- 防具・AutoTotem・AutoSlotの処理を直列化し、拾ったアイテムやTotem発動の通知から更新を起動。スロット移動後の古い位置を使い続けません。
- Legacy形式のサーバーでは防具を手に選んで使用する処理も行い、サーバーから防具枠と手持ちの変化を確認。未確認なら通常の装備交換へ進みます。再接続を成功判定に使いません。
- 無差別攻撃の表示と設定名の不一致を修正しました。
- シュルカーの必要品を複数スタック取り出し、途中の同種スタックへ先に合流。通常の装備が既にあれば余分を取りません。力以外のポーションを力ポーションの在庫数に含めません。
- PAはLegacy/Nukkitのピストン方向表現を補正。足場 → ピストン → Crystal → 電源の確認後、エンティティ押し込みを受信しないLegacyサーバーでは、その場で実際に受信したCrystalの起爆へ進みます。押し込みが成功したとは表示しません。
- Jetpackの処理がAnti ONという理由だけで開始されない条件を修正。自分のCrystalへの攻撃・その消失・自分への爆風を確認した後だけ、爆風から最大1秒動作します。必要な体力・Totem・地形条件を満たさなければ待機理由を表示します。通常の戦闘中のAnti設定を勝手にOFFにはしません。
- 経路にない高所へ跳ぼうとする判定を減らし、追尾停止でジャンプ入力を残さないようにしました。

大量のtell連投・全Botのチャット洪水・受信拒否やmute後の別Botへの切り替えは含めません。通常の公開チャットとtell送信は使えます。

## 検証範囲

自動テストで、OAuthの許可・拒否・期限・再使用防止・取り消し、保存・復元・キャッシュ移行、装備のサーバー更新、補充・追従・PAのパケット処理を確認しています。実際の2b2e・IGN、Microsoftサインイン、Discordアプリ、Railwayの実環境での動作は、この環境からは未確認です。実サーバーでまだ失敗する場合は、その時点のWebの状態レポートで確認してください。

公式仕様: [Discord OAuth2](https://docs.discord.com/developers/topics/oauth2)、[Nukkit PlayerInventory](https://github.com/CloudburstMC/Nukkit/blob/master/src/main/java/cn/nukkit/inventory/PlayerInventory.java)、[Nukkit ItemArmor](https://github.com/CloudburstMC/Nukkit/blob/master/src/main/java/cn/nukkit/item/ItemArmor.java)、[Nukkit BlockPistonBase](https://github.com/CloudburstMC/Nukkit/blob/master/src/main/java/cn/nukkit/block/BlockPistonBase.java)。
