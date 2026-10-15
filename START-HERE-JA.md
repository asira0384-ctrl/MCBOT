# 更新後の使い方

1. ZIPのAsiraClearBotフォルダ内をGitHubの既存ファイルへ上書き。vendorも含めます。
2. Railway VariablesでBOT_NAMESを次の値へ変更。

```
Aslrq01x,Aslrq02x,Aslrq03x,Aslrq04x,Aslrq05x,Aslrq06x,Aslrq07x,Aslrq08x,Aslrq09x,Aslrq10x
```

3. `IGN_BOT_NAME=Aslrq00x`。`IGN_HOST`にIGNの統合版IP、`IGN_PORT`にポートを指定。未設定ならBot11の接続は省略。
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
