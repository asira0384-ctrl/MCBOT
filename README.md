v0.1.6: connection で位置パケットID・送信数を診断。movement both は停止状態で旧方式の位置送信も併用して接続互換性を検証。movement auto で元に戻ります。接続し直すとautoになります。
v0.1.5: /bot target:1 command:view で受信地形の視点画像。紫格子は未受信です。画面UI・プレイヤーは描画しません。
<!-- v0.1.4: キュー待機中の重力停止・位置同期・テレポート確認応答 -->
# Asira Clear Bot v0.1 — 統合版 / GitHub / Railway

Bot01: **Aslrq 1st**。接続先: **2b2e.org:19132**。
Discordの全コマンドはユーザー **1343843235252146219** のみ使用可能です。

## 最初に知っておくこと

これは初回テスト用の実装です。移動、採掘、足場、補給、回復はコードに実装していますが、**2b2eに実アカウントで接続しての検証はまだ行っていません**。動作保証済みの完成版ではありません。まず1体・3×3程度で接続、座標、停止、アイテム移動を順に確認してください。複雑な地形・段差・サーバー独自の処理では停止する場合があります。

ローカル検証: 12テスト成功。権限判定、データ保存、補給後3秒、満スタック廃棄、空/中身入りシュルカー、サーバーに拒否された移動、地形の座標、1.21.2/1.26.51の送信パケット形式。実サーバーでの移動・整地の検証とは別です。

## GitHubに入れる

1. ZIPを展開する。
2. GitHubで新しいリポジトリを作る（Private推奨）。
3. `AsiraClearBot`フォルダーの**中身**をアップロードする。
4. リポジトリの一番上に `package.json`・`package-lock.json`・`Dockerfile`・`railway.json`・`src`・`vendor` が見える状態にする。ZIP自体を入れるだけでは起動しません。
5. `node_modules`、`data`、`.env`はアップロードしない。トークンや認証キャッシュはコードに入れない。

GitHubはコードの置き場です。実行はRailwayが行います。GitHub Actionsを常時稼働用ホストには使いません。

## Discord Botを用意する

Discord Developer PortalでApplication → Botを作成し、Botトークンを取得する。
招待のスコープは `bot` と `applications.commands`。権限は View Channels / Send Messages。
特権Intentsは不要。BOTは Guilds intentしか要求しません。

## Railwayで起動する

1. New Project → Deploy from GitHub repo → このリポジトリを選択。
2. Variablesに設定する。

| 変数 | 値 |
|---|---|
| `DISCORD_TOKEN` | Discord Botのトークン |
| `DISCORD_GUILD_ID` | コマンドをすぐ表示させたいDiscordサーバーのID（任意） |
| `MC_HOST` | `2b2e.org` |
| `MC_PORT` | `19132` |
| `BOT_NAMES` | `Aslrq 1st` |
| `DATA_DIR` | `/data` |

`MC_VERSION`は最初は未設定。接続先の広告するプロトコルをbedrock-protocolが自動選択します。未対応のプロトコルなら接続を止めます。「最新」とサーバーの対応版は一致しない場合があります。必要時にエラーに合わせて対応バージョンを指定してください。

3. **Volumeを追加してMount Pathを `/data` にする。** 認証・管理者・採掘数・置いた足場を保存します。Volumeなしでは再デプロイで消える可能性があります。
4. Serverless / App Sleepingは無効にする。Minecraft Botは常時接続が必要です。
5. Deploy。Dockerfileが使われ、`npm start`でDiscord/Minecraftの両方を管理します。
6. ログで `Discord ready: /help` を確認する。

最初はMinecraft Botを接続しません。下記のDiscordコマンドで接続します。Railwayの外向きUDPで接続テストが必要です。接続拒否やタイムアウトはサーバー対応版・認証・ネットワークを確認してください。稼働時間、CPU、メモリ、通信の追加使用量はRailwayの請求対象です。

## 初回ログイン

Discordで:

```
/bot target:1 command:connect
/auth target:1
```

`/auth`で表示されるMicrosoft公式リンクを開き、コードを入力し、**Aslrq 1stのアカウント**でログインする。まだコードがなければ数秒後に `/auth` をもう一度実行。コードはAsiraにだけ表示します。パスワードをDiscordチャットに書く必要はありません。

違うゲーマータグでログインした場合は停止します。MicrosoftアカウントにXboxプロフィールが必要です。ゲーム所有・アクセス条件などは接続先とMicrosoft認証の要件に従います。名前を設定するだけでオンラインのアカウントを作ることはできません。

接続後:

```
/bot target:1 command:status
/logchannel channel:通知用チャンネル
```

## ゲーム内の操作権限を登録

Botと同じサーバーに自分のプレイヤーを入れてから:

```
/admin add mcid:自分のゲーマータグ
```

空白を含む名前をそのまま指定する。プレイヤー一覧からXbox XUIDを取得して保存します。取得できない場合のみ、正確なXUIDを `/admin add` の `xuid` に指定。

`/admin list` / `/admin remove mcid:名前` で管理できます。
**ゲーム内からの権限追加・解除はありません。**
ゲーム内チャットは名前だけで許可せず、登録したXUID・MCID・現在のプレイヤー一覧が一致するパケットのみ受け付けます。2b2e側がチャットをsystem形式に置き換える場合、ゲーム内操作は受け付けずDiscord操作を使います。文字列からプレイヤー名を推測して権限を与える処理は入れていません。

## 1体で最初の採掘テスト

Botを、動きやすい床のあるテスト位置へ用意する。ダイヤ/ネザライトピッケル、エンチャント金リンゴ、足場ブロックを渡す。
初回はチェスト補給を切り、手渡しを確認します。

```
/bot target:1 command:supply off
/bot target:1 command:scaffold minecraft:slime_block
/bot target:1 command:area -1 -1 1 1
/bot target:1 command:floor 64
/bot target:1 command:ceiling 67
/bot target:1 command:start
```

**上の座標は例です。実際の場所に置き換えてください。**
`floor 64` はY=64以下を残し、Y=65〜ceilingの指定範囲を撤去します。床の新設や穴埋め、溶岩処理は行いません。

停止:

```
/bot target:all command:stop
```

実際に動作が止まることを確認してから範囲を広げてください。

## 全コマンド

Discordは `/bot target:番号またはall command:コマンド本文`。
ゲーム内は `!コマンド 番号またはall 引数`。

| 操作 | Discordのcommand欄 | ゲーム内例 |
|---|---|---|
| 接続 | `connect` | Discord専用 |
| 切断 | `disconnect` | Discord専用 |
| 開始・再開 | `start` | `!start 1` |
| 停止 | `stop` | `!stop all` |
| 状態/座標/不足品 | `status` | `!status all` |
| 採掘数 | `stats` | `!stats all` |
| 今回の集計を0に | `stats-reset` | `!stats-reset 1` |
| 範囲 | `area x1 z1 x2 z2` | `!area all -20 -20 20 20` |
| 残す床 | `floor Y` | `!floor all 64` |
| 掘る上限 | `ceiling Y` | `!ceiling all 120` |
| 足場指定 | `scaffold 名前または数値ID` | `!scaffold 1 minecraft:slime_block` |
| 渡したブロックを登録 | `scaffold receive` | `!scaffold 1 receive` |
| チェスト自動補給 | `supply on/off` | `!supply all on` |
| 雑談 | `chat on/off` | `!chat all off` |
| 自動リスポーン | `respawn on/off` | `!respawn all off` |
| 補給途中の箱を回収 | `recover` | `!recover 1` |
| 手動回収済み情報の解除 | `clear-recovery confirm` | Discord専用 |

数値IDはこの実装のminecraft-dataブロックレジストリのIDです。古い統合版IDと同じとは限りません。名前指定を推奨。英語名、`minecraft:`付き名、スライム/スライムブロック/丸石/砂/黒曜石の日本語エイリアスを受け付けます。

## 足場と補給

- 設定したブロックで通路・段差を作り、自分が置いた座標を記録する。
- 届く距離にあり、プレイヤーや次の足場を支えていない足場を回収する。届かなくなった足場や帰路に必要な足場は残ることがあります。**すべてを必ず回収する保証はありません**。
- `scaffold receive`は受け取り待ち。ブロックの受け取りを確認した最後の時刻から3秒後に再開。まだ範囲・床が未設定なら採掘は開始しない。
- `stop`は受け取りによる自動再開も解除する。
- ピッケル、エンチャント金リンゴ、足場が不足するとゲーム内/通知チャンネルで知らせて待機する。手渡し後3秒以上経過し、必要品がそろうと再開。
- ピッケルは残り耐久10以下で使わない。体力は吸収ハートを除く通常HPを見て、ハート6個**未満**で採掘を中断しエンチャント金リンゴを食べる。
- ElytraFlyは使わないため、エリトラの補給は要求しない。
- 採掘によって得るブロック/ドロップの種類を記録し、合計が1スタックに達すると1スタック捨てる。足場・装備・補給用品・シュルカーは保護する。特殊なドロップの名称は追加調整が必要な場合があります。

## エンダーチェストとシュルカー

必要品: エンダーチェスト、**シルクタッチ付きの耐久が十分あるピッケル**、インベントリ空き3枠以上、箱を置くための床。
エンダーチェストの中身はBotアカウントごとに用意する。

1. エンダーチェストを置き、必要なアイテムを取り出す。
2. シュルカーを取り出して置き、27枠の受信を確認する。
3. 足場、ピッケル、エンチャント金リンゴを補給する。
4. 全27枠が空なら、回収したシュルカーを捨てる。
5. 中身が残る場合は回収し、エンダーチェストへ戻す。
6. エンダーチェストもシルクタッチで回収する。

砂・砂利・コンクリートパウダーは下に支えがある場所だけ設置する。空中の通路にはスライムや丸石などが向いています。

満杯、アイテム移動拒否、停止、切断などで補給を中断した場合は箱を保護し、採掘を止める。`recover`で回収を試せます。状態が変わっていて判断できない場合は手動確認。箱を自分で回収し終えた場合だけ `clear-recovery confirm` を実行する。

## 10体に増やす

まずBot01の実動作を確認する。Railwayの `BOT_NAMES` を例のように増やして再デプロイ:

```
Aslrq 1st,AslrqBot02xx,AslrqBot03xx,AslrqBot04xx,AslrqBot05xx,AslrqBot06xx,AslrqBot07xx,AslrqBot08xx,AslrqBot09xx,AslrqBot10xx
```

実際に作成したXboxゲーマータグに置き換える。アカウントの並び順がBot番号になり、認証保存先も番号ごとなので、既存の順番を変えない。

`/bot target:all command:connect` 後、`/auth target:1`〜`10`で各アカウントを認証。
同じ範囲・床を指定した接続済みBotにはX方向に分けた担当区域を割り当てる。ブロック/設置場所の予約で重複操作を避ける。規模やサーバー状況によって経路調整が必要です。

雑談は全体で10〜30分間隔の短いやり取り。停止中・補給待ちのBotは雑談しない。最初の1体でも短い発言ができます。

## 状態・集計

`stats`は累計/今回、黒曜石/その他を表示。**足場回収、補給箱回収は採掘数に含みません**。
操作回数ではなく、採掘中のターゲットがサーバーの地形更新で空気になった時に集計します。他プレイヤーが同じブロックを同時に掘った場合の厳密な区別はできません。
`stats-reset`は今回の集計だけ消す。再起動で採掘は自動再開しません。Volumeの累計は保持する。

死亡時は初期設定で自動リスポーンし補給待ち。接続が切れた場合は自動で連続再接続せず、Discordから `connect`。5回以上/10秒の移動補正を検知すると停止・通知する。

## この版の限界

- 世界全体の無人整地を保証するものではありません。ローカルな経路探索・足場作成を実装した試作です。
- 読み込んでいない場所を空気だと仮定しません。走査終了でも到達できない/未読込の場所が残る可能性があるため、整地完了を宣言しません。
- 岩盤・未知のブロック・液体・ポータル・自分の補給箱・プレイヤーを支える床を対象から除外します。地形によって手動位置調整が必要です。
- 壁/足場の移動、サーバー権威の採掘、食事と容器の操作は実サーバーの挙動で追加修正が必要な可能性があります。
- インベントリ移動はitem_stack_requestの承認を待つ。拒否・確認不能時に成功扱いにしません。
- インベントリが別のサーバー独自パケットで管理される場合などは、この版の対応外です。

## ローカル実行（任意）

Node.js 24、Gitをインストール。PowerShell:

```powershell
npm ci
$env:DISCORD_TOKEN="取得したトークン"
$env:DISCORD_GUILD_ID="サーバーID"
$env:BOT_NAMES="Aslrq 1st"
$env:DATA_DIR="$PWD/data"
npm start
```

`npm test`でローカル検証。`.env.example`は設定例で、トークン入りの`.env`をリポジトリに保存しない。

## 技術・出典

- bedrock-protocol 3.60.1: https://github.com/PrismarineJS/bedrock-protocol
- prismarine-registry / prismarine-chunk: https://github.com/PrismarineJS
- Microsoft device-code認証はbedrock-protocol/prismarine-authの公開APIを使用。
- 1.26系は1.18以降のチャンク実装を明示的に選択し、レジストリは接続バージョンのものを使う。入力フラグの形式変更やItemV4に分岐対応。
- MITのbedrockflayerの物理・制御・経路探索を調整して使用。由来と変更点は `vendor/bedrockflayer/SOURCE.md` と `LICENSE`。

## v0.1.1 接続・認証修正

- 認証前でもdisconnectが接続を確実に閉じます。終了通知は1回だけです。
- 古い接続から遅れて届いたコードを無視し、切断・認証成功時に古い表示を消します。
- 認証中のconnect連打では認証をやり直しません。/authは同じ認証の有効なコードを表示します。
- コードが出ない場合は現在の段階を表示します。認証キャッシュが有効ならコード入力は不要です。
- Microsoft認証成功、UDP接続、サーバーログイン、ワールド読み込みを通知します。
- UDP接続待ちは60秒、全体の接続待ちは最大15分です。

更新はこのZIP内の内容をGitHubの既存ファイルへ上書きし、Railwayの新しいデプロイ完了後に /bot target:1 command:connect を実行してください。Microsoft認証待ちの通知が出た場合だけ /auth target:1 を使います。

Microsoft認証後にUDP接続タイムアウトが出る場合、ホストの外向きUDP通信、サーバー側の応答・アクセス制限などを別途調査する必要があります。この修正は実サーバーへの接続成功を保証するものではありません。

## v0.1.2 通信方式修正

前版のjsp-raknetはRakNetのバージョン10を固定で送信していました。今の統合版用にバージョン11を選べるNative RakNetへ切り替えました。サーバー広告の版検出も同じNative RakNetを使います。Linuxのカーネル番号で同梱バイナリが見つからない場合、N-APIバイナリを適切な読込場所へ配置し、ビルド時に読込を確認します。Node.js 24へ更新しました。

Discord専用の通信診断: `/bot target:1 command:diagnose`。DNS、UDP応答、広告プロトコルと対応版を表示します。Minecraftアカウントにログインせず診断できます。応答がないことだけでRailway側のUDP制限とは断定できません。

GitHubではDockerfile、scripts、package.json、package-lock.json、srcも含めて中身を上書きしてください。デプロイ成功後、connectを実行します。実サーバーへの接続はMicrosoft認証を含めて別途確認が必要です。

## v0.1.3 サーバー到着の確認と転送

spawnは接続先が送る初期化通知であり、2b2e本ワールド到着の証明ではありません。待機サーバーでもspawnを受信することがあります。表示を変更し、statusに接続先、地形受信の有無、受信パケット数、最後の切断理由を追加しました。

- `/bot target:1 command:messages`: 最近のサーバー案内、タイトル、フォーム、start_game、転送先、切断記録を表示。内容はRailwayのログにも残ります。
- `/bot target:1 command:say /コマンド`: サーバーの案内に従って実際に必要なコマンドを手動送信。Discordの所有者専用。架空のjoinコマンドなどは自動送信しません。
- サーバーからtransferパケットが届いた場合、同じBotアカウントで転送先へ接続。連続3回まで。disconnectまたはサービス停止で転送待ちをキャンセル。採掘は自動再開しません。
- 足元の地形が未受信ならstartを止めます。地形受信だけでも本ワールド到着は断定できません。

更新後は connect、次に messages と status の結果を確認してください。既存のMC_VERSION指定と認証キャッシュはそのまま使います。本ワールドに入っていない原因の確定には、実際の案内文やパケット状況が必要です。
