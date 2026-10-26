# v0.3.21 のコマンド

最新版の操作は [UPDATE-v0.3.21-JA.md](UPDATE-v0.3.21-JA.md)。AutoLogは「装備 → 体力・AutoLog設定」、テーマは「設定」。接続先がIGNのBotは番号に関係なくautoworld・autotp等を使用できます。

`/admin add user:@相手`を1回実行するとpanel/Webの両方を許可し、共有ボタンを出します（Asira本人だけが登録・解除）。相手はボタン、または `/panel`・`/web` から開始できます。Webの専用リンクを押せばログインでき、追加のOAuth設定は不要です。最大20体に対応。グループは`all`・`ign`・`2b2e`。

MinecraftのIDはWebの「概要 → ＋アカウント追加」から登録でき、Variablesへの記入は不要です。グリーター対象IDもチャットの設定へ保存できます。

WebはDiscordの `/web`、Discordのボタンは `/panel` です。下記は `/bot target:1 command:内容` の「内容」に入れます。

| 内容 | 動作 |
| --- | --- |
| login fresh | 切断済みのこのアカウントだけ保存認証を退避し、再認証して接続 |
| scaffold off / scaffold on | 足場の自動設置をOFF／ON。選択したBotごとに保存。OFFでも置いた足場の回収は可能 |
| falllimit 64 | 着地先を確認して落下する上限。0〜384、初期64。Web・パネルにも設定あり |
| cleanup | 自分で置いた不要な足場を、安全な地面へ退いて上から回収 |
| mineblocks obsidian,netherrack | 範囲内の指定ブロックだけを、範囲全体の高い段から1チャンクずつ掘る。allで解除 |
| follow direct Player One | 最短の経路を探して追従 |
| follow trail Player One | 実際に観測した足跡を追従 |
| inventory sync | 所持品の再同期を要求 |
| chatqueue clear | 待機中の公開チャットを取り消し |
| world cpe | IGNにコマンド `/world cpe` を送る |
| autoworld on cpe | IGNのリスポーン後にWorldコマンド |
| login | Minecraftに接続せずMicrosoft認証を開始 |
| account set Aslrq01x | ゲーマータグを保存して切り替え。認証はアカウント別に保持 |
| eatspeed 0.12 | 食事中の移動速度を指定。NoSlowもON |
| noslow on / noslow off | 食事中の速度制御を切り替え |
| eat / drink | 今すぐ金リンゴ／力ポーションを使用 |
| ka on / ca on / pa on | 戦闘機能のON。offで解除 |
| anticrystal on / anticrystal off | AntiCrystalのON/OFF |
| goto fly overworld 100 100 100 | 座標へ飛行。00の天井は穴を探して抜ける |
| elytrafly off | 滑空を終了して着地 |
| drop 7 16 / swap 1 10 | スロット7から16個破棄／1番と10番を交換。番号は1始まり |
| bps / nearby / debug | 速度／周辺プレイヤー／状態の診断 |

`/auth target:1` だけで認証を開始・確認できます。認証が終わったら `connect`。Webでは「ログイン・接続」から認証とサーバー接続を続けて行います。認証完了後の別の接続クリックは不要です。失敗したら同じ画面に理由を表示します。

KAの初期間隔75ms、CA設置50ms・起爆25msへ変更しました。食事中はAntiを維持して速度0.12で退避します。食事にはゲーム側の使用時間が必要です。既存のコマンドは引き続き使用できます。


「接続」は接続希望も保存し、次回起動時に保存認証で再接続します。「切断」は自動再接続も止めます。Webの更新・閉じる操作はMinecraftを止めません。

ゲーム内では `!pos`、`!pos 1`、`!pos all`、`!coord`、`!position` を誰でも使用できます。座標以外の操作管理者はDiscordから登録します。

## v0.3.21 追加コマンド

以下は `/bot target:1 command:…` のcommand欄です。`all`・`ign`・`2b2e`にも対応します。

| command | 内容 |
| --- | --- |
| `chunks 0 0` | チャンク(0,0)を指定 |
| `chunks -2 -2 2 2` | 両端を含む25チャンクを指定 |
| `gamelogs off` / `gamelogs on` | ゲーム内への自動ログ全体 |
| `gamelogs mining off` | 採掘ログだけOFF |
| `lava on` / `lava off` | 耐火確認つき溶岩通過 |
| `lavaspeed 0.24` | 溶岩移動速度 |
| `velocity on 0 50` | 横0%・縦50%のノックバック |
| `velocity off` | 通常のノックバック |
| `viewdistance 8` | 地形受信距離の要求（2〜8チャンク） |

チャンク座標はブロック座標÷16の切り捨てです。例: X=-1はチャンクX=-1。床・上限・採掘対象は既存の `floor`・`ceiling`・`mineblocks` で設定します。`area` を新たに指定するとチャンク選択を解除します。文面別ログと離れた複数チャンクの選択はWebで操作できます。ログ種類は `connection / mining / movement / health / gear / supply / greetings / system` です。
