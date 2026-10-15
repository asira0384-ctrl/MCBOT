# v0.3.7 更新

戦闘・移動・補充の許可とWebのアイテム画像／交換／破棄、BPS、周辺プレイヤー、アカウント変更を追加しました。

**先に [UPDATE-v0.3.7-JA.md](UPDATE-v0.3.7-JA.md) を開いてください。** `web`も必ず上書きし、Ctrl+F5でWeb画面を更新します。認証を残すにはRailwayのVolumeを `/data` に接続します。

# v0.3.6 Web管理画面

## v0.3.6 Web管理画面

同じRailwayで動くWeb管理画面を追加しました。スマホ・PCからBot単体、2b2e全体、IGN、全体を操作できます。接続・移動・装備・戦闘・整地・チャット・1秒更新ログ・視点・状態レポートに対応します。Discordの既存操作も維持します。

**使い方**: 全ファイルをGitHubへ上書き → 再デプロイ → RailwayのNetworkingでGenerate Domain → Discordで `/web url:取得したhttpsのURL` → 本人用リンクを開く。2回目からは `/web` だけです。詳細は **WEB-GUIDE-JA.md** を参照してください。

ログインはDISCORD_OWNER_IDの本人だけが発行できる一度限りのリンクです。別のパスワード設定は不要です。Webからゲーム内の管理者登録はできません。登録は引き続きDiscordの `/admin` を使います。

今回のWeb画面は既存のBot実装を操作します。Minecraft側のモジュールはv0.3.5と同じです。既存のVariables・アカウント・設定・dataを維持してください。webフォルダとDockerfileの更新も必要です。

# v0.3.5 更新後に最初に試すこと

1. **vendorも含めて全ファイルをGitHubに上書き** → Railwayの新しいデプロイを待つ → Botを接続し直す。起動ログ・パネルでv0.3.5を確認。
2. `/panel` →「装備設定」→「今すぐ金リンゴ」「力ポーション」で手動確認。状態レポートの `lastItemUse.status=confirmed` は実個数の減少を確認できた場合だけです。
3. 自動回復を8ハート以下にする: `/bot target:1 command:autoeat on 8`。以前の4ハート設定は自動で書き換えません。
4. 戦闘: 敵登録 → `ka on` + `ca on`。PAも使うなら `pa on`。ホールにいる、しゃがんでいない敵だけPA対象です。
5. 全員の座標は、ゲーム内で誰でも `!pos all`。同じサーバーにいるBotをまとめて返します。

| 設定 | Discordのcommand欄に入れる内容 |
| --- | --- |
| 今すぐ食べる / 力ポーション | `eat` / `drink` |
| 回復する体力 | `autoeat on 8` |
| KA・CA・PA | `ka on` / `ca on` / `pa on` |
| 爆風を受けて短時間Jetpack | `jetpack on` |
| CrystalのID予測 | `predict 10` / `predict off` |
| 直進のみ追加24%加速 | `timer on 0.24` / `timer off` |
| 追尾速度 | `chasespeed 0.27` |

Timerの0.24は「追加倍率」と解釈しています。飛行速度・各設定はサーバー側の制限も受けます。実サーバーは未検証です。詳細はCOMMANDS-JA.md冒頭を参照してください。

# 更新後の使い方

1. ZIPのAsiraClearBotフォルダ内をGitHubの既存ファイルへ上書き。vendorも含めます。
2. Railway VariablesでBOT_NAMESを次の値へ変更。

```
Aslrq01x,Aslrq02x,Aslrq03x,Aslrq04x,Aslrq05x,Aslrq06x,Aslrq07x,Aslrq08x,Aslrq09x,Aslrq10x
```

3. `IGN_BOT_NAME=Aslrq00x`。`IGN_HOST`にIGNの統合版IP、`IGN_PORT`にポートを指定。`IGN_VERSION=1.26.51`を指定できます。未設定時もBot11は1.26.51で接続します。未設定ならBot11の接続は省略。
4. 再デプロイ後、`/panel`で各Botを選んで接続。または `/bot target:all command:connect`。
5. `/auth target:1`〜`/auth target:10`を順に開き、その番号のMicrosoftアカウントで認証。Bot11はAslrq00x。

- 座標（誰でも）: `!pos` / `!pos 1` / `!pos all`。Discordは `/pos target:1`。
- ゲーム内操作権限: Discordで `/admin add mcid:名前`。本人がBotと同じサーバーにいる時に登録。
- グリーター: `GREET_TARGET_ID=対象の名前`。IGNだけ変えるなら `IGN_GREET_TARGET_ID`。起動後 `/bot target:1 command:greeter status` と `greeter test`で確認。
- 移動: `/panel`の移動から方法・世界・座標を指定。ネザー移動はゲートを探して歩きます。
- 補給: `supply on`。手渡し・箱受け取りはパネル「装備・箱を受け取る」。近くの箱は10ブロック以内。
- 戦闘: `enemy add 空白入りの名前` → `ka on`。登録済みの敵だけが対象。`armor on` / `autototem on` / `autoslot now` / `anticrystal on` / `anticrystal off`。
- 視点: パネル「視点画像」→「今の視点に更新」。

認証トークン・Discord_TOKENを他の人へ渡さないでください。配布するのはコードのZIPです。

## v0.3.4の追加

追尾速度は初期値0.27。変更は `/bot target:11 command:chasespeed 0.27`。通常速度へ戻すなら `speed off`。AntiCrystalは追尾中も維持します。飲食と追尾は並行し、同じ手を使う攻撃は飲食が終わってから再開します。

AutoSlotが未完了なら状態レポートの `lastStackResponse` と `autoSlotPending`、飲食は `lastItemUse` を確認できます。所持品に防具がなければ自動装備はできません。近くの補給箱か手渡しで用意してください。
