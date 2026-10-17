# v0.3.11 検証記録

2026-10-17。`npm test`：283テスト成功、失敗0、スキップ0。

## 今回追加した16件

- Nukkit形式のAddPlayer・MoveActorの足元座標、目線基準のMovePlayer、部分更新を混ぜても高さが変わらないこと。
- 受信済み床で目線基準の別実装を確認した場合、そのプレイヤー・パケットの基準を保持し、他人に適用しないこと。
- KA＋CAで剣の選択から攻撃まで間を確保し、攻撃・設置・起爆の処理が繰り返し進むこと。
- 通常形式とNukkit形式の2種類について、実際の物理ループで送信した向きをサーバー役が読み取り、足場→ピストン→Crystal→電源→押し込み→同じCrystalの起爆まで進むこと（2件）。
- 受信した逆向きピストンから方式を学習し、回収と再配置を経て電源・起爆へ進むこと。
- 床にAntiで埋まった相手をPAのホール扱いせず、CAは有効な床上の設置面を選ぶこと。
- 繰り返しの位置補正でも、足を上へ出さずAntiを基準の床に合わせ、追尾を再開すること。手動のOFFでは解除すること。
- 遠いサーバーテレポートで古いAntiの高さを使わず、戦闘中にジャンプ復帰や自動GLIDEを始めないこと。
- Anti追尾中に視点を0・90・180度へ変えても、送信した移動入力と実際の移動方向が一致すること。
- 手の操作が終わると回復を開始し、同じスロットへの装備パケットを追加送信しないこと。
- 自分のサーバー使用フラグで中断を検知し、使用を再開して実際の個数減少を確認すること。
- インベントリを開いた攻撃を拒否するサーバー役に対し、画面を閉じて攻撃し、別スロットの遅い移動確認も完了できること。
- AutoSlotが戦闘中の選択スタックを移動させず、保護解除後に整理を完了すること。

- 位置補正でPAの設置面が射程外へ移った場合、古い配置を破棄して追尾を再開できること。
- PAのCrystalが尽きた場合、PAが手の所有権を残さずKAへ戻れること。

既存テストのうち、AddPlayerを目線座標としていた2件の入力を足元座標へ直し、即時の同期攻撃を前提としていた2件を非同期の持ち替え完了を待つ検証へ変更しました。

既存の認証保存、権限、Discord・Web API、インベントリ確認、自然落下、衝突、リスポーン、水中避難、補給許可、友達判定、PAの遅い電源応答などもまとめて実行しました。

## 確認に用いた一次ソース

- [CloudburstMC/Nukkit Player.java](https://github.com/CloudburstMC/Nukkit/blob/master/src/main/java/cn/nukkit/Player.java)：アイテム使用、装備変更時の使用解除、インベントリ画面と攻撃の処理。
- [Entity.java](https://github.com/CloudburstMC/Nukkit/blob/master/src/main/java/cn/nukkit/entity/Entity.java)、[EntityHuman.java](https://github.com/CloudburstMC/Nukkit/blob/master/src/main/java/cn/nukkit/entity/EntityHuman.java)、[Level.java](https://github.com/CloudburstMC/Nukkit/blob/master/src/main/java/cn/nukkit/level/Level.java)：プレイヤー座標と移動通知。
- [BlockPistonBase.java](https://github.com/CloudburstMC/Nukkit/blob/master/src/main/java/cn/nukkit/block/BlockPistonBase.java)、[ItemEdible.java](https://github.com/CloudburstMC/Nukkit/blob/master/src/main/java/cn/nukkit/item/ItemEdible.java)：ピストンの方向と食事の使用時間判定。

接続先の実際のNukkit派生版とプラグイン構成は、このソースと同一であると確認できていません。受信方向・ブロック・個数を確認する処理にして、差を診断できる記録を追加しています。

## 検証範囲

実際の通信スキーマ、受信地形、物理処理と、ブロック・エンティティ・インベントリの応答を返す模擬サーバーによる検証です。

本番のRailway、2b2e、IGNには接続していません。実際の入室・攻撃の命中、対戦相手の装備や効果込みのダメージ、11体同時稼働、実ブラウザ表示と音声は未確認です。
