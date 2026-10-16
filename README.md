# Asira Clear Bot v0.3.9

Minecraft統合版のBotをDiscordとWebから操作する、既存MCBOTサービス用の更新版です。

**更新手順は [UPDATE-v0.3.9-JA.md](UPDATE-v0.3.9-JA.md) を開いてください。** ZIPを解凍し、AsiraClearBotフォルダの中身をGitHubの既存ファイルへ上書きします。Railwayのデプロイ成功後、WebをCtrl+F5で再読み込みします。Variablesと保存済みdataは引き継いでください。

## この版の修正

- Webのログイン・接続を一続きに修正。Microsoft認証の完了後、自動でサーバーへ接続。
- 接続段階とエラー、再試行・キャンセル・状態レポートを同じ画面に表示。
- Volumeの保存注意を接続エラーと分け、認証済みだけで入室成功と表示しないよう変更。

以下のv0.3.8の修正も含みます。

- Webの文字・ボタンを拡大し、明るい文字色とON/OFF表示を採用。
- 戦闘をインベントリ整理の待ち時間から分離。実際に手を使っている時は保護。
- 食事を始める前の余計な待機を削除。Antiを維持して退避し、食事中のNoSlow速度は初期0.12。
- PAのピストン更新から方向情報が抜ける問題と、JetpackのCrystal待ちを修正。
- 開始した飛行の滑空維持、00の天井の穴探索、水から岸への避難後の飛行再開。
- ドラッグ交換・スタック破棄、操作音と全Botの補充通知。
- Microsoft認証をMinecraftの接続から独立。アカウント別の認証保存と切断中の保存状態表示。

## 案内

- [初回設定・更新](START-HERE-JA.md)
- [Web操作](WEB-GUIDE-JA.md)
- [コマンド一覧](COMMANDS-JA.md)
- [修正内容と制約](UPDATE-v0.3.8-JA.md)
- [検証結果](VALIDATION-v0.3.8.md)

Node.js 24用です。Discordの操作は設定された本人だけが使えます。ゲーム内の座標確認は誰でも使え、操作管理者の登録はDiscordから行います。

既定ではBot1〜10が2b2e用のAslrq01x〜Aslrq10x、Bot11がIGN用のAslrq00xです。Bot11にはIGN_HOST・IGN_PORTを設定してください。認証したゲーマータグは設定と一致する必要があります。

認証・設定はDATA_DIRへ保存します。RailwayではMCBOTにVolumeを接続し、Mount PathとDATA_DIRを両方 /data にします。Volumeなしの再デプロイでは認証を引き継げません。認証情報を含むdataや.envはGitHubへアップロードしないでください。

247個の自動テストに成功しています。2b2e・IGN・Railway本番での実接続、ブラウザの実表示と音声出力はこの環境では確認していません。サーバー独自の制約による反映を保証するものではありません。
