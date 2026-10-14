# ボタンで使う（v0.2.3）

1. `/help` →「操作パネルを開く」。通知先の同名ボタン、`/panel`、`/bot target:1 command:panel` でも開けます。
2. 対象Botを選び「接続」。必要なら「認証コード」でログイン。
3. 「装備・箱を受け取る」を押して、アイテムを渡すかシュルカーを近くに置く。
4. 「移動」→方法と世界→「座標を入力して移動」。
5. 止める時は「停止」。「装備設定」でAutoTotem・AutoSlot・回復を設定。
6. 「ログ・管理者」で通知先と5秒更新ログを設定。
7. 動かない時は「状態レポート」を押して `bot-report.json` を保存する。

飛行速度のGUIはブロック/秒で入力します。従来の文字コマンドの `flyspeed` はブロック/tickです。
自動リスポーンは「装備設定」で設定。死亡は体力と死亡パケットで判定し、生存確認後にチャットへ座標を出します。

リスポーン後に水中なら自動で空気と乾いた足場へ避難します。手動では「移動」→「水から避難」。停止ボタンで避難も止められます。

装備操作はインベントリの開封応答と、スロット変更の確認を待ちます。「装備設定」のインベントリ方式は通常「サーバー指定で自動」。失敗の理由はGUIと状態レポートに出ます。

## 公開チャット・tell

- `/say target:1 message:こんにちは`：公開チャットへ送信。
- `/w target:1 id:xMr hagi jr message:こんにちは`：指定IDへtell。`id` 欄に空白入りの名前をそのまま入れます。
- GUIは「チャット」→「公開チャット送信」または「tell」。`target:all` も使えます。Discord管理者本人だけ送信できます。

`/bot` のcommand欄でも `say こんにちは`、`w "xMr hagi jr" こんにちは` と入力できます。

## 対象IDと自動挨拶

Railway Variablesに **`GREET_TARGET_ID=Asira`** を追加して再デプロイ。ローカルは `.env` に設定して再起動。Asiraの参加・退出・公開チャットに反応し、`@Asira | Yo! | Dbzwhc15T9` の形式で送ります。末尾の英数字10文字は毎回変わります。空欄ならOFFです。

複数Botが同じ通知を受けても1イベントにつき1体を選んで送ります。公開チャットへの返事は60秒間隔。Bot自身の入場・通常切断・AutoLogにも挨拶を追加しています。

以下の文字コマンドも使えます。

# v0.2.0 操作一覧

すべて `/bot target:1 command:...`。`target:all` は全Botが対象です。
Discordの操作は設定したDiscord管理者だけ。ゲーム内コマンドはDiscordで登録したMCID・XUIDだけ使用できます。敵の登録とログの設定はDiscord限定です。

## 最初に

1. `/bot target:1 command:connect`
2. 認証が必要な時だけ `/auth target:1`。
3. `/logchannel channel:通知用チャンネル`
4. `/bot target:1 command:log on`
5. `/bot target:1 command:autoslot receive` → 装備や箱を渡す・近くに置く。

## 追加コマンド（command欄に入力）

| コマンド | 動き |
|---|---|
| `escape` | 空気・乾いた足場への水中避難を開始 |
| `inventorymode auto` / `stack` / `legacy` | インベントリ通信方式。通常auto |
| `log on` / `log off` | 座標・体力・装備・敵・送信数などを5秒更新 |
| `autoslot receive` | 渡された物・シュルカーから装備を受け取る |
| `autoslot recover` | 補給途中の箱を再処理 |
| `autoslot now` | 所持品をホットバーへ整理 |
| `autoslot on` / `off` | 受信後の自動整理を切り替える |
| `gear on` / `off` | より良い所持防具へ着替える |
| `autototem on` / `off` | Totemをオフハンドへ、ない時は盾 |
| `heal on` / `off` | 6ハート未満でエンチャント金リンゴ |
| `autolog on 3` / `autolog off` | 3ハート以下で切断（数字は変更可） |
| `enemy add Enemy Name` | 敵のゲーマータグ登録。空白をそのまま入力 |
| `enemy remove Enemy Name` / `enemy list` | 敵を解除・一覧 |
| `killaura on` / `off` | 指定した敵を追って剣で攻撃。力があれば飲む |
| `anticrystal 0.55` / `anticrystal off` | 戦闘中に0.55ブロック埋まる設定 |
| `goto walk overworld 100 64 100` | 現世の座標へ徒歩 |
| `goto dig overworld 100 64 100` | 頭・足元の邪魔なブロックを掘りながら徒歩 |
| `goto fly overworld 100 90 100` | エリトラを装着して指定座標へ飛行 |
| `elytrafly overworld 100 90 100` | 同じ飛行移動の別コマンド |
| `elytrafly off` | 飛行を止め、確認済みの着地点へ降りる |
| `flyspeed 1.5 0.7` | 横・上下のブロック/tick。ゆっくりなら `0.2 0.1` |
| `goto walk nether 100 64 100` | 既存ポータルでネザーへ入り、その座標へ徒歩 |
| `goto dig nether 100 64 100` | 掘る移動でポータルへ、ネザーの座標へ |
| `goto fly nether 100 90 100` | ポータルまでは徒歩、ネザー内では飛行 |
| `respawn on` / `respawn off` | 自動リスポーン（初期ON） |
| `runtime` | 装備・機能設定・戦闘・移動の状態 |
| `stop` | 採掘・戦闘・受け取り・移動を停止。防具/Totem/回復の保護は継続 |

`goto` のディメンションは `overworld` / `nether`。指定座標は移動先のディメンションの値です。
ポータルは受信済みの近隣を探索します。入口を作る処理や、未受信の遠方を自動探索する処理はありません。

## AutoSlotの順番

1. 剣
2. ツルハシ
3. エンチャント金リンゴ
4. 力のポーション
5. 予備Totem
6. 予備盾
7. 花火ロケット
8. その他（自動割当なし）
9. 受け取り箱の一時装着

オフハンドはTotem優先、なくなれば盾です。予備がない場合は5番・6番には入れません。箱の回収用に空き枠を残します。
ECへ中身入りシュルカーを収納する時は、ECとシルクタッチのツルハシを渡してください。空きがない時や操作を拒否された時は箱を捨てず、停止して通知します。

## 整地（従来どおり）

`area -20 -20 20 20` → `floor 64` → `start`。
`stats` / `status` / `messages` / `view` で確認します。
`scaffold receive` は足場の受け取り待ち、`scaffold cobblestone` は足場の指定。
`recover` は従来の整地用EC補給の回収、`autoslot recover` は新しい装備受け取りの回収です。

新機能はローカルテスト済み。2b2e上の戦闘・飛行・新しい補給・リスポーンは実アカウントで未確認です。
