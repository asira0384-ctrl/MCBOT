'use strict';
window.AsiraDesk=(()=>{
const D={}, pairs=s=>s.trim().split('\n').forEach(l=>{let [ja,en]=l.split('|');D[ja]=en;});
pairs(`
無差別攻撃|Attack All
Bot援護|Bot Assist
補充の確認|Restock requests
オンラインプレイヤー|Online players
オンラインプレイヤー ID候補・一覧|Online player IDs
最初のアカウントを追加|Add first account
サバイバル|Survival
現在地|Position
Minecraftアカウント|Minecraft account
アカウント一覧|Accounts
順番TP・カスタムコマンド|TP chain & commands
円フォーメーション|Circle formation
溶岩とVelocity|Lava & Velocity
座標へ移動|Go to coordinates
移動の設定|Travel settings
プレイヤーを追従|Follow player
インベントリ|Inventory
体力・AutoLog設定|Health & AutoLog
IGN · リスポーン後の操作|IGN respawn actions
戦闘モジュール|Combat modules
敵の登録|Enemies
フレンド|Friends
戦闘の設定|Combat settings
Crystal ID予測|Crystal ID prediction
整地の範囲|Mining area
足場と補給|Scaffold & supply
エモート・スキン|Emotes & skins
AI設定 · IGNGPT|AI settings · IGNGPT
チャットを送信|Send chat
グリーター|Greeter
指定した人への返事|Player replies
定期案内|Scheduled announcements
送信待ち・制限通知|Chat queue & limits
みんなの地図|World map
観測したプレイヤー|Observed players
近くのプレイヤー|Nearby players
ゲーム内へのログ送信|In-game log delivery
リアルタイムログ|Live logs
操作履歴|Action history
見た目とサウンド|Appearance & audio
壁紙|Wallpaper
サウンド|Sound
仕上げ|Preferences
操作画面の配色|ClickGUI colors
アカウントと設定のバックアップ|Account & settings backup
アカウントを追加|Add account
ログイン・接続|Sign in & connect
詳細コマンド|Custom command
接続・停止|Connection controls
背景|Background
文字|Text
OFFの機能|Inactive fill
GUI全体カラー|Accent
ON背景|Active fill
ON文字|Active text
OFF文字|Inactive text
パネル透明度（100で不透明）|Panel opacity
背景ぼかし（0でOFF）|Background blur
GUIスケール|GUI scale
行の高さ|Row height
☆ お気に入り|☆ Favorites
☆ お気に入りに登録|☆ Pin module
★ 登録済み|★ Pinned
← モジュール一覧|← Close settings
壁紙の暗さ|Wallpaper dimming
画像を選ぶ|Choose image
テーマ|Theme
設定を開く|Open settings
設定を保存|Save settings
保存|Save
音量|Volume
操作音|Click sound
通知音|Notification sound
移動方法|Travel mode
移動先の世界|Destination dimension
半径（ブロック）|Radius (blocks)
中心プレイヤー|Center player
実行|Run
接続先|Server
体力|Health
個数|Count
対象|Target
メッセージ|Message
表示|Display
`);
Object.assign(D,{"0〜10（0でOFF）": "0–10 (0: off)", "1kit補充を申請": "Request one supply kit", "1体ずつ順番に送信": "Send one bot at a time", "2b2e": "2b2e", "2b2e の全Bot": "All 2b2e bots", "4チャンク": "4 chunks", "6チャンク": "6 chunks", "8チャンク": "8 chunks", "AIに覚えさせるメモ（1行に1件、最大30件）": "AI notes (one per line, max 30)", "AIサービス": "AI provider", "AIモデル": "AI model", "AI設定を保存": "Save AI settings", "AutoEmote 間隔（秒）": "Emote interval (seconds)", "AutoLogする体力": "AutoLog HP", "AutoLogの条件": "AutoLog trigger", "AutoLog設定を開く ↗": "Open AutoLog settings", "AutoSlotを実行": "Run AutoSlot", "Back": "Back", "Bot": "Bot", "Botに戻る": "Return to bot", "Combat": "Combat", "ElytraFly": "ElytraFly", "End": "End", "Gemini APIキー": "Gemini API key", "Gemini（無料枠対応）": "Gemini (free tier)", "Glass / 澄んだ音": "Glass", "IGN": "IGN", "IGN PvP": "IGN PvP", "IGN設定を保存": "Save IGN settings", "Inventory": "Inventory", "Jetpack": "Jetpack", "KAリーチ": "KA reach", "Kitを取得": "Get kit", "Kit名": "Kit name", "Light / ライト": "Light", "Midnight / ダークブルー": "Midnight", "Misc": "Misc", "Movement": "Movement", "Nether": "Nether", "Nuke / Build": "Nuke / Build", "OFF": "OFF", "Obsidian / ブラック": "Obsidian", "Ocean / ブルーグリーン": "Ocean", "Overworld": "Overworld", "Playerlist": "Playerlist", "PvP設定で開始": "Start PvP preset", "Retro / 電子音": "Retro", "Settings": "Settings", "Soft / やわらかい音": "Soft", "TPAを送る": "Send TPA", "TPA先のID": "TPA recipient", "Totemが割れた瞬間": "When a totem pops", "Totem残り0 ＋ 設定体力以下": "No totems and low HP", "Velocity ON": "Velocity ON", "Velocityを設定してON": "Apply velocity", "Violet / パープル": "Violet", "Worldへ移動": "Travel to world", "World名": "World name", "X": "X", "Y": "Y", "Z": "Z", "tell（個別メッセージ）": "Whisper", "×": "×", "← モジュール一覧": "← Close settings", "↓ 状態レポート": "↓ Status report", "↪": "↪", "↻": "↻", "−": "−", "■ 停止": "■ Stop task", "▶ 接続": "▶ Connect", "☆ お気に入り": "☆ Favorites", "☆ お気に入りに登録": "☆ Pin module", "このアカウントの接続先": "Account server", "このアカウントを再認証": "Reauthenticate account", "この座標へ移動 ↗": "Go to position", "この高さだけ": "Only this height", "この高さ以下の表面": "Surface below height", "すべてOFF": "Disable all", "すべてON": "Enable all", "すべてのBot": "All Bots", "その他": "Other", "アカウントを追加": "Add account", "アカウントを追加する": "Add account", "アクセント": "Accent", "エンド": "End", "オンラインのIDから追加": "Add online player", "オンラインプレイヤー": "Online players", "ゲーマータグ": "Gamertag", "ゲーマータグを保存": "Save gamertag", "ゲームコマンド送信": "Send game command", "コピー": "Copy", "コードをコピー": "Copy code", "コードを手入力する": "Enter code manually", "サーバー": "Server", "スキンをインポート（64×64 / 128×128 PNG）": "Import skin (64×64 / 128×128 PNG)", "スキンを合わせる": "Match skin", "チェストから黒曜石補充をON": "Enable obsidian restock", "チャット": "Chat", "チャットへの返事": "Chat replies", "テーマ": "Theme", "ネザー": "Nether", "バックアップから復元": "Restore backup", "バックアップ用パスワード": "Backup password", "フレンドに追加": "Add friend", "ブロックリーチ": "Block reach", "ブロック名": "Block name", "マップ": "Map", "メッセージ": "Message", "ログ": "Logs", "ログイン": "Login", "ログイン・接続": "Sign in & connect", "ログイン・接続を再試行": "Retry login & connect", "上限Y": "Maximum Y", "世界": "World", "中心プレイヤー": "Center player", "今すぐ金リンゴ": "Eat apple now", "今の視点に更新": "Refresh view", "保存": "Save", "保存して採掘": "Save & mine", "個数": "Count", "停止": "Stop", "全体マップ": "World map", "公開チャット": "Public chat", "円を作って追従": "Follow in circle", "円を解除": "Stop circle", "再起動後の認証保存について": "Saved login after restart", "切り替えるゲーマータグ": "Switch gamertag", "切断": "Disconnect", "切断中の全Botへ復元": "Restore disconnected bots", "力ポーション": "Strength potion", "半径（ブロック）": "Radius (blocks)", "参加時の文章（1行に1種類）": "Join messages (one per line)", "受信距離": "View distance", "同じサーバーの対象Bot全員": "All targets on this server", "周辺マップ": "Local map", "味方": "Friend", "地図の色・ネームタグ": "Map colors & nametags", "壁紙の暗さ": "Wallpaper dimming", "天気の既定都市": "Default weather city", "始点 X": "Start X", "始点 Z": "Start Z", "実行": "Run", "実際の足跡をたどる": "Follow footsteps", "対象Botの送信待ちを取り消す": "Clear outgoing queue", "対象Botへグリーターを保存": "Save greeter for targets", "対象Botへ定期案内を保存": "Save announcements for targets", "対象Botへ返事を保存": "Save replies for targets", "対象ID（1行に1人）": "Target IDs (one per line)", "対象のID（1行に1人・複数可）": "Player IDs (one per line)", "対象の全Botが各1回ずつ送信": "Each selected bot sends once", "対象リストへ追加": "Add target", "戦闘を停止": "Stop combat", "所持品を再同期": "Resync inventory", "手に持つ": "Hold item", "持っていたTotemがすべてなくなった時": "When all totems are gone", "挨拶をテスト": "Test greeting", "捨てる": "Drop", "掘りながら歩く": "Mine while walking", "掘るブロック（空欄は全て）": "Blocks to mine (blank: all)", "採掘レンジ": "Mining range", "接続をキャンセル": "Cancel connection", "接続先": "Server", "接続先を変更して接続": "Change server & connect", "操作するBot": "Control target", "操作音": "Click sound", "操作音 OFF": "Click sound OFF", "操作音を試す": "Test click sound", "整地を開始": "Start mining", "敵": "Enemy", "敵に追加": "Add enemy", "文章（1行に1種類）": "Messages (one per line)", "断面": "Slice", "暗号化して保存": "Save encrypted backup", "更新を一時停止": "Pause updates", "最初のTP先": "Initial TP target", "最短ルートを探す": "Fastest route", "最近の接続ログ": "Recent connection logs", "検知する言葉（1行に1件・どれかを含む。空欄なら全発言）": "Trigger phrases (one per line; blank: any)", "標準に戻す": "Reset default", "標準の背景に戻す": "Reset wallpaper", "標準の音": "Default sound", "横ノックバック %": "Horizontal knockback %", "歩く": "Walk", "残す床Y": "Floor Y", "残す床のY": "Floor Y", "水から避難": "Escape water", "溶岩通過 ON": "Lava travel ON", "溶岩速度": "Lava speed", "状態レポートを保存": "Save status report", "現世": "Overworld", "画像を選ぶ": "Choose image", "直進Timer・追加倍率": "Straight-line timer multiplier", "相手のゲーマータグ": "Recipient gamertag", "着地する": "Land", "移動先の世界": "Destination dimension", "移動先を選ぶ": "Choose destination", "移動方法": "Travel mode", "管理者・許可した人": "Admins & allowed users", "範囲を保存": "Save area", "終点 X": "End X", "終点 Z": "End Z", "縦 %": "Vertical %", "置いた足場を回収": "Recover scaffold", "落下して降りる上限（ブロック）": "Max drop (blocks)", "表示": "Display", "装備・箱を受け取る": "Receive gear / containers", "補給を再開": "Resume supply", "見た目を保存": "Save appearance", "設定を保存": "Save settings", "設定を開く": "Open settings", "設定体力以下（Totemの個数を問わない）": "Below HP threshold (any totem count)", "許可するMCID（1行に1人）": "Allowed MCIDs (one per line)", "診断ログを更新": "Refresh diagnostics", "詳細コマンド": "Custom command", "誰でも": "Anyone", "質問できる人": "Who can ask", "足場 OFF · 置かない": "Scaffold OFF", "足場 ON · 必要最小限": "Scaffold ON (minimal)", "足場に設定": "Use as scaffold", "足場を受け取る": "Accept scaffold", "踊りを停止": "Stop emotes", "踊る": "Emote", "返事（1行に1種類・ランダム選択）": "Random replies (one per line)", "返信するBot": "Responding bots", "追尾の速度": "Chase speed", "追従するMCID": "Follow MCID", "追従を停止": "Stop following", "追従を開始": "Start following", "追従モード": "Follow mode", "退出時の文章": "Leave messages", "送信 ↗": "Send ↗", "送信先": "Recipient", "送信担当": "Sender", "通知 OFF": "Notifications OFF", "通知音": "Alert sound", "通知音を試す": "Test alert", "選択中のBotで実行": "Run on selected bots", "選択中のBotに実行": "Run on selected bots", "選択中のBotに適用": "Apply to selected bots", "選択解除": "Clear selection", "金リンゴを食べる体力": "Eat apple below HP", "間隔（ブロック）": "Spacing (blocks)", "間隔（秒）": "Interval (seconds)", "降りる高さを保存": "Save drop height", "音をテスト": "Test sound", "音量": "Volume", "順番TP停止": "Stop TP chain", "順番TP開始": "Start TP chain", "順番に1体": "One in sequence", "飛行・上下の速度": "Vertical flight speed", "飛行・横の速度": "Horizontal flight speed", "食事中の速度（NoSlow）": "Eating speed (NoSlow)", "高さ Y": "Height Y", "黒曜石補充OFF": "Obsidian restock OFF", "＋": "＋", "＋ アカウント追加": "＋ Add account", "■ 作業停止": "■ Stop task"});
const names={'Combat':'戦闘','Movement':'移動','Render':'描画','Player':'プレイヤー','Misc':'その他','Bot':'Bot','Nuke / Build':'採掘・建築','Chat':'チャット','Playerlist':'プレイヤー一覧','Log':'ログ','Settings':'設定','Account':'アカウント'};
const mods={KillAura:'キルオーラ',CrystalAura:'クリスタルオーラ',PistonCrystal:'ピストンクリスタル',AntiCrystal:'アンチクリスタル',AutoLog:'自動ログアウト',Jetpack:'ジェットパック',FeetTrap:'足元トラップ',AutoTotem:'自動トーテム',AutoSlot:'自動スロット',Armor:'自動装備',AutoEat:'自動回復',AutoRespawn:'自動リスポーン',AutoSupply:'自動補給',NoSlow:'移動減速無効'};
const alias={KillAura:'ka',CrystalAura:'ca',PistonCrystal:'pa',AntiCrystal:'anti',AutoTotem:'トーテム totem',AutoEat:'金リンゴ gapple'};
let lang=localStorage.getItem('asira-desk-lang')==='en'?'en':'ja';
function en(t){return D[t]||(/^オンラインプレイヤー/.test(t)?'Online player IDs':t);}
function label(t){return lang==='en'?en(t):mods[t]||names[t]||t;}
const key=t=>t.normalize('NFKC').toLowerCase().replace(/[\s・_-]+/g,'');
function matches(e,q){const s=[e.title,en(e.title),mods[e.title],alias[e.title],e.group,names[e.group],e.node.querySelector('small')?.textContent].join(' ');return q.trim().split(/\s+/).every(v=>key(s).includes(key(v)));}
function language(v){lang=v==='en'?'en':'ja';document.documentElement.lang=lang;localStorage.setItem('asira-desk-lang',lang);}
function face(node,b){
 if(node.dataset.face===(b.face||'-'))return;
 node.dataset.face=b.face||'-';node.replaceChildren();if(!b.face){node.textContent=String(b.id).padStart(2,'0');return;}
 const bytes=Uint8ClampedArray.from(atob(b.face),c=>c.charCodeAt(0)),n=Math.sqrt(bytes.length/4);if(!Number.isInteger(n)||n<8||n>64)return;
 const c=document.createElement('canvas');c.width=c.height=n;c.setAttribute('aria-label',b.name);c.getContext('2d').putImageData(new ImageData(bytes,n,n),0,0);node.append(c);
}
const div=(cls,text)=>{const n=document.createElement('div');n.className=cls;if(text!==undefined)n.textContent=text;return n;};
function gearPct(item){const m=/^(leather|golden|chainmail|iron|diamond|netherite)_(helmet|chestplate|leggings|boots)$/.exec(item?.name||'');let max=m?({leather:5,golden:7,chainmail:15,iron:15,diamond:33,netherite:37}[m[1]]*{helmet:11,chestplate:16,leggings:15,boots:13}[m[2]]):item?.name==='elytra'?432:null;return max?Math.max(0,Math.min(100,Math.ceil((max-item.damage)/max*100))):null;}
const cards=new Map();
function hud(bots,sprite,atlas){
 const box=document.getElementById('desk-hud');for(const [id,o]of cards)if(!bots.some(b=>b.id===id)){o.remove();cards.delete(id);}
 for(const b of bots){let c=cards.get(b.id);if(!c){c=div('bot-hud');cards.set(b.id,c);box.append(c);}
 const items=b.inventory||[],hot=items.slice(0,9),kit=[...(b.armor||[]),b.offhand],known=!!b.inventorySync?.at,totems=[...items,b.offhand].reduce((s,i)=>s+(/^totem(_of_undying)?$/.test(i?.name)?i.count:0),0);
 const sign=JSON.stringify([lang,b.name,b.face,b.connected,b.health,b.absorption,b.bps,hot,kit,known,totems,!!atlas]);if(c.dataset.sign===sign)continue;c.dataset.sign=sign;c.replaceChildren();
 const h=div('hud-id'),f=div('hud-face');face(f,b);h.append(f,document.createTextNode('[BOT'+b.id+'] '+b.name));c.append(h);
 if(!b.connected){c.append(div('hud-note',lang==='en'?'Offline':'オフライン'));continue;}
 const hp=Number.isFinite(b.health)?Math.max(0,Math.min(20,Math.ceil(b.health))):null;
 c.append(div('hud-note','HP '+(hp??'—')+'/20   ·   '+Number(b.bps||0).toFixed(2)+' BPS'));
 const hearts=div('hud-hearts');if(hp!==null){hearts.append(document.createTextNode('♥'.repeat(hp)));let empty=document.createElement('span');empty.textContent='♡'.repeat(20-hp);hearts.append(empty);}c.append(hearts);
 const gold=Math.max(0,Math.ceil(b.absorption||0));c.append(div('hud-gold','♥'.repeat(Math.min(gold,20))+(gold>20?' +'+(gold-20):'')));
 if(!known){c.append(div('hud-note',lang==='en'?'Awaiting inventory':'所持品を受信待ち'));continue;}
 function slot(i,armor){const v=div('hud-slot'+(!armor&&i?.selected?' held':'')),pic=div('');sprite(pic,i?.name);v.append(pic);const pct=armor?gearPct(i):null;let txt=pct!==null?pct+'%':i?.count>1?i.count:'';if(txt!=='')v.append(div('hud-qty',txt));v.title=(i?.name||'—')+(pct!==null?' '+pct+'%':'');return v;}
 const equip=div('hud-equip');kit.forEach(i=>equip.append(slot(i,true)));equip.append(div('hud-total','Σ Totem '+totems));c.append(equip);
 const bar=div('hud-hotbar');for(let n=0;n<9;n++)bar.append(slot(hot[n],false));c.append(bar);}
}
return {D,language,label,matches,hud,face,get lang(){return lang;}};
})();
