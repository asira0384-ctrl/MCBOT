'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {OWNER}=require('./store');
const {defaults}=require('./runtime');
const COOKIE='asira_session';
const digest=value=>crypto.createHash('sha256').update(String(value)).digest('hex');
const random=()=>crypto.randomBytes(32).toString('base64url');
const fail=(status,message)=>Object.assign(Error(message),{status});
const itemToken=raw=>digest(raw?[raw.network_id,raw.metadata||0,raw.count||0,JSON.stringify(raw.extra?.nbt||null)].join(':'):'empty');
const cleanCode=value=>String(value||'').toUpperCase().replace(/[\s-]/g,'');
function baseURL(value){
 if(!value)return '';
 let url;try{url=new URL(value);}catch{throw Error('WebのURLは https:// から入力してください');}
 const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
 if((url.protocol!=='https:'&&!(local&&url.protocol==='http:'))||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error('WebのURLは公開サイトのルートURLを指定してください');
 return url.origin;
}
function sameToken(a,b){const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));return x.length===y.length&&x.length>0&&crypto.timingSafeEqual(x,y);}
function redact(text){return /(?:access_token|refresh_token|user_code|DISCORD_TOKEN|Bearer\s)/iu.test(String(text))?'認証情報を含む行を省略しました':String(text).slice(0,700);}
async function body(req,limit=8192){
 if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))throw fail(415,'JSON形式で送信してください');
 let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>limit)throw fail(413,'送信内容が長すぎます');chunks.push(chunk);}
 try{const value=JSON.parse(Buffer.concat(chunks).toString());if(!value||typeof value!=='object'||Array.isArray(value))throw Error();return value;}catch{throw fail(400,'JSONの内容が不正です');}
}
class WebControl{
 constructor(manager,options={}){
  this.manager=manager;this.owner=String(options.owner||OWNER);this.env=options.env||process.env;this.now=options.now||Date.now;this.enabled=this.env.WEB_ENABLED!=='false';this.ready=options.ready||(()=>true);
  this.loginTTL=options.loginTTL||120000;this.sessionTTL=options.sessionTTL||30*24*3600000;
  this.base=baseURL(options.baseURL||this.env.WEB_BASE_URL||manager.store.data.webBaseURL||(this.env.RAILWAY_PUBLIC_DOMAIN?'https://'+this.env.RAILWAY_PUBLIC_DOMAIN:''));
  this.discordLogin=new(require('./discord-login').DiscordLogin)(this,options.fetch);this.codes=new Map();this.sessions=new Map();this.attempts=new Map();this.events=new Set();this.closed=false;this.audit=[];this.requests=new Map();this.viewAt=new Map();
  const directory=path.join(__dirname,'..','web');this.assets=new Map([
   ['/',{type:'text/html; charset=utf-8',buffer:fs.readFileSync(path.join(directory,'index.html'))}],
   ['/assets/app.css',{type:'text/css; charset=utf-8',buffer:fs.readFileSync(path.join(directory,'app.css'))}],
   ['/assets/ui-state.js',{type:'text/javascript; charset=utf-8',buffer:fs.readFileSync(path.join(directory,'ui-state.js'))}],
   ['/assets/app.js',{type:'text/javascript; charset=utf-8',buffer:fs.readFileSync(path.join(directory,'app.js'))}],
   ['/favicon.svg',{type:'image/svg+xml',buffer:fs.readFileSync(path.join(directory,'favicon.svg'))}]
  ]);
  this.sessionRepository=new(require('./web-sessions').WebSessions)(manager.store,this.owner,this.now);
  for(const v of this.sessionRepository.rows())if(v.owner===this.owner&&this.isAllowed(v.discordId||v.owner)&&/^[a-f0-9]{64}$/.test(v.key)&&v.expires>this.now()&&typeof v.csrf==='string')this.sessions.set(v.key,{csrf:v.csrf,expires:v.expires,label:String(v.label||'Asira').slice(0,80),owner:this.owner,discordId:v.discordId||v.owner,profile:v.profile||null});
  this.manager.stateSubscribers??=new Set();this.onStateChange=()=>this.requestPump();this.manager.stateSubscribers.add(this.onStateChange);this.timer=setInterval(()=>this.pump(),1000);this.timer.unref?.();
 }
 isAllowed(id){return require('./discord-login').permitted(this.manager.store,String(id),this.owner);}
 publicProfile(session){return session.profile||{id:session.discordId||this.owner,name:session.label,username:session.label,avatar:null};}
 createSession(req,res,user){for(const [key,s]of this.sessions)if(s.expires<=this.now())this.sessions.delete(key);if(this.sessions.size>=60)this.sessions.delete(this.sessions.keys().next().value);const token=random(),session={csrf:random(),expires:this.now()+this.sessionTTL,label:user.name,owner:this.owner,discordId:user.id,profile:user};this.sessions.set(digest(token),session);this.persistSessions();const old=res.getHeader('Set-Cookie');res.setHeader('Set-Cookie',[...(old?[].concat(old):[]),this.cookie(req,token,this.sessionTTL/1000)]);return session;}
 requireOwner(session){if((session.discordId||session.owner)!==this.owner)throw fail(403,'この操作はAsira本人専用です');}
 persistSessions(revocations=[]){const rows=[...this.sessions].slice(-60).map(([key,s])=>({key,csrf:s.csrf,expires:s.expires,label:s.label,owner:this.owner,discordId:s.discordId||this.owner,profile:s.profile||null}));this.manager.store.data.webSessions=this.sessionRepository.save(rows,revocations);this.manager.store.save();}
 configureURL(actor,value){if(String(actor)!==this.owner)throw fail(403,'本人のみ設定できます');this.base=baseURL(value);this.manager.store.data.webBaseURL=this.base;this.manager.store.save();return this.base;}
 issueLogin(actor,label='Asira'){
  if(this.closed)throw Error('再起動中です。少し待ってください');
  if(!this.enabled)throw Error('Web管理はOFFです。WEB_ENABLED=falseを解除してください');
  if(String(actor)!==this.owner)throw fail(403,'コードログインは本人専用です。Discordでログインしてください');
  if(!this.base)throw Error('RailwayでGenerate Domainを実行してから /web url:https://取得したドメイン を実行してください');
  const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',code=[...crypto.randomBytes(12)].map(n=>alphabet[n&31]).join('');
  this.codes.clear();this.codes.set(digest(code),{expires:this.now()+this.loginTTL,label:String(label).slice(0,80)});
  return {url:this.base+'/#login='+code,code:code.slice(0,6)+'-'+code.slice(6),expiresInSeconds:this.loginTTL/1000};
 }
 loginMessage(actor,label){if(this.discordLogin.ready()&&this.isAllowed(String(actor)))return {content:`[DiscordでWeb管理へログイン](${this.base}/)`,allowedMentions:{parse:[]}};if(String(actor)!==this.owner)throw Error('Discordログインの設定がまだ完了していません');const login=this.issueLogin(actor,label);return {content:`[Web管理画面を開く](${login.url})\n本人専用・一度限り・2分間有効です。\n手入力する場合のコード: **${login.code}**`,allowedMentions:{parse:[]}};}
 targets(value){
  const target=String(value||'');if(target==='2b2e'||target==='ign')return [...this.manager.names.keys()].filter(n=>require('./realms').selected(this.manager.store,n)===target);
  if(target!=='all'&&!/^(?:[1-9]|1[0-9]|20)$/.test(target))throw fail(400,'Bot番号またはグループを選んでください');
  return this.manager.targets(target);
 }
 snapshot(){
  const names=this.manager.names,bots=[...names].map(([id,name])=>{
   const w=this.manager.workers.get(id),b=w?.bot,state=this.manager.store.bot(id),r=w?.runtime?.snapshot?.(),p=b?.entity?.position,realm=b?.config?.realm||require('./realms').selected(this.manager.store,id),ign=realm==='ign';
   const item=(raw,slot)=>{if(!raw?.count)raw=null;return {slot,name:raw?(b?.name?.(raw)||raw.name||'unknown'):'',count:raw?.count||0,damage:raw?(b?.damage?.(raw)||0):0,token:itemToken(raw),selected:slot===b?.quickBarSlot};};
   return {id,name,reconnection:this.manager.connectionKeeper?.snapshot(id)||null,server:realm,connected:!!b?.connected,dead:!!b?.dead,phase:b?.connectionPhase||'未接続',mode:w?.mode||'offline',health:b?.health??null,absorption:Math.max(0,Number(b?.absorption)||0),chatDelivery:b?require('./chat-delivery').snapshot(b):null,chatQueue:b?.chatQueue?.snapshot?.()||{pending:0,waitMs:0},onlinePlayers:b?[...(b.players?.values()||[])].map(p=>p.name):[],mining:w?.miner?.snapshot()||null,
    endpoint:{host:b?.config?.host||(ign?this.env.IGN_HOST:this.env.MC_HOST)|| (ign?'IGN未設定':'2b2e.org'),port:b?.config?.port||Number((ign?this.env.IGN_PORT:this.env.MC_PORT)||19132)},
    position:p?{x:p.x,y:p.y,z:p.z}:null,dimension:b?.dimensionId??0,config:{...defaults,...state.runtime,...(ign?{anticrystal:false}:{})},
    messaging:require('./messaging').snapshot(this.manager,id,b),options:{respawn:state.respawn,autoSupply:state.autoSupply,chat:state.chat,floor:state.floor,ceiling:state.ceiling,area:state.area,scaffold:state.scaffold,miningFilter:state.miningFilter||[]},
    inventorySync:{revision:b?.inventoryRevision||0,at:b?.lastInventoryAt||null,pending:b?.pendingStackRequest?{action:b.pendingStackRequest.action,at:b.pendingStackRequest.at}:null,manual:b?.manualInventoryOperation||null,last:b?.lastStackResponse||null},inventory:Array.from({length:36},(_,n)=>item(b?.items?.[n],n)),armor:Array.from({length:4},(_,n)=>item(b?.armor?.[n],n)),offhand:item(b?.offhand?.[0],-1),
    bps:r?.telemetry?.bps||0,verticalBps:r?.telemetry?.verticalBps||0,restock:r?.restock||null,nearby:w?.runtime?.telemetry?require('./tactics').nearby(w.runtime):[],accounts:state.accountHistory||[name],authentication:this.manager.authentication?.(id)||null,authCacheSaved:this.manager.accounts?.snapshot(id,name).saved||false,ignActions:r?.ignActions||state.ignActions||null,followingPlayer:r?.followingPlayer||{...state.follow,points:0},runtime:r?{selfDefense:r.selfDefense,autoLog:r.autoLog,rollbackRecovery:r.rollbackRecovery,paused:r.paused,operation:r.operation,movement:r.movement,target:r.target,combatWaiting:r.combatWaiting,attacksSent:r.attacksSent,totemsUsed:r.totemsUsed,consumption:r.consumption,lastItemUse:r.lastItemUse,crystalCombat:r.crystalCombat,featureErrors:r.featureErrors,lastError:r.lastError}:null,
    packetsReceived:Object.values(b?.packetCounts||{}).reduce((a,n)=>a+Number(n||0),0),corrections:b?.positionCorrections||0,logs:(this.manager.logs.get(id)||[]).slice(-30).map(redact)};
  });
  return {version:require('../package.json').version,at:this.now(),bots,alerts:this.manager.alerts||[],friends:(this.manager.store.data.friends||[]).map(e=>e.name),enemies:(this.manager.store.data.enemies||[]).map(e=>e.name),audit:this.audit.slice(-30)};
 }
 session(req){
  const token=this.token(req);if(!token)return null;const key=digest(token);let session=this.sessions.get(key);if(this.sessionRepository.revoked(key)){this.sessions.delete(key);return null;}
  if(!session){const saved=this.sessionRepository.find(key);if(saved){const {key:ignored,...value}=saved;session=value;this.sessions.set(key,value);}}
  if(!session||session.expires<=this.now()||!this.isAllowed(session.discordId||session.owner)){this.sessions.delete(key);return null;}return {...session,key};
 }
 token(req){const cookie=String(req.headers.cookie||'').split(';').map(p=>p.trim()).find(p=>p.startsWith(COOKIE+'='));return cookie?.slice(COOKIE.length+1)||null;}
 renew(req,res,session){if(session.expires-this.now()>this.sessionTTL*.75)return;const current=this.sessions.get(session.key);if(!current)return;current.expires=this.now()+this.sessionTTL;session.expires=current.expires;this.persistSessions();res.setHeader('Set-Cookie',this.cookie(req,this.token(req),this.sessionTTL/1000));}

 ip(req){return req.socket.remoteAddress||'local';}
 origin(req){return this.base||((req.socket.encrypted?'https':'http')+'://'+req.headers.host);}
 checkOrigin(req){if(req.headers.origin&&req.headers.origin!==this.origin(req))throw fail(403,'別のサイトからの操作は受け付けません');}
 headers(res){
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob: https://cdn.discordapp.com; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'");
 }
 cookie(req,value,seconds){const secure=this.origin(req).startsWith('https:');return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}; Expires=${new Date(this.now()+seconds*1000).toUTCString()}${secure?'; Secure':''}`;}
 json(res,status,value){if(res.writableEnded)return;res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value,(_,v)=>typeof v==='bigint'?String(v):v));}
 authenticate(req){const session=this.session(req);if(!session)throw fail(401,'Discordの /web からログインしてください');return session;}
 mutate(req,session){this.checkOrigin(req);if(!sameToken(req.headers['x-csrf-token'],session.csrf))throw Object.assign(fail(403,'画面の認証状態を更新しています。もう一度操作してください'),{code:'CSRF_STALE'});}
 async login(req,res){
  this.checkOrigin(req);const ip=this.ip(req),now=this.now(),previous=this.attempts.get(ip);
  if(previous&&previous.until>now&&previous.count>=8){res.setHeader('Retry-After','60');throw fail(429,'少し待ってから /web で新しいリンクを発行してください');}
  this.attempts.set(ip,{count:previous&&previous.until>now?previous.count+1:1,until:previous&&previous.until>now?previous.until:now+60000});
  const {code}=await body(req),normalized=cleanCode(code),entry=this.codes.get(digest(normalized));
  if(!/^[A-HJ-NP-Z2-9]{12}$/.test(normalized)||!entry||entry.expires<=now)throw fail(401,'リンクが使用済みか期限切れです。Discordの /web から開き直してください');
  this.codes.delete(digest(normalized));this.attempts.delete(ip);
  for(const [key,value]of this.sessions)if(value.expires<=now)this.sessions.delete(key);
  if(this.sessions.size>=60)this.sessions.delete(this.sessions.keys().next().value);
  const token=random(),session={csrf:random(),expires:now+this.sessionTTL,label:entry.label,owner:this.owner};this.sessions.set(digest(token),session);this.persistSessions();
  res.setHeader('Set-Cookie',this.cookie(req,token,this.sessionTTL/1000));this.json(res,200,{ok:true,csrf:session.csrf,owner:session.label,expires:session.expires});
 }
 async once(req,session,run){
  const id=String(req.headers['x-request-id']||'');if(!/^[a-zA-Z0-9-]{8,80}$/.test(id))throw fail(400,'操作IDがありません。画面を再読み込みしてください');
  const key=session.key+':'+id,old=this.requests.get(key);if(old)return old.promise;
  if(this.requests.size>400)throw fail(429,'操作が多いため少し待ってください');
  const promise=Promise.resolve().then(run);this.requests.set(key,{at:this.now(),promise});return promise;
 }
 record(ids,action){this.audit.push({at:this.now(),ids,action:String(action).slice(0,60)});this.audit=this.audit.slice(-60);}
 async command(data){
  const ids=this.targets(data.target),command=String(data.command||'').trim();if(!command||command.length>1000||/[\x00-\x1f]/.test(command))throw fail(400,'コマンドの内容が不正です');
  const name=command.split(/\s/)[0].toLowerCase();if(['admin','owner','web'].includes(name))throw fail(403,'管理者の登録はDiscordから行ってください');
  if(!ids.length)throw fail(400,'先にWebでアカウントを追加してください');const results=[];for(const [index,id]of ids.entries()){
   if(this.closed)throw fail(503,'終了処理中のため残りの操作を中止しました');
   try{if(name==='anticrystal'&&command.split(/\s+/)[1]!=='off'&&this.manager.realm?.(id)==='ign'&&ids.length>1){results.push({id,ok:true,result:'IGNではAntiをOFFのまま維持します'});continue;}if(['autokit','autotp','autoback','autoworld','kit','tpa','back','world'].includes(name)&&this.manager.realm?.(id)!=='ign'){results.push({id,ok:true,result:'IGN専用操作のため省略'});continue;}if(name==='connect'&&this.manager.requestConnection){this.manager.requestConnection(id);results.push({id,ok:true,result:'ログイン・接続を開始しました。認証画面で進行状況を確認してください'});}else if(name==='connect'&&this.manager.accounts&&!this.manager.workers.get(id)?.bot.connected&&!this.manager.accounts.snapshot(id,this.manager.names.get(id)).saved)results.push({id,ok:true,result:'先に単体Botを選んで「Microsoft認証」を押してください。未認証のままサーバーには接続しません'});else results.push({id,ok:true,result:await this.manager.execute(String(id),command,'web')});}catch(e){results.push({id,ok:false,result:String(e.message)});}
   if(name==='connect'&&index<ids.length-1)await new Promise(resolve=>setTimeout(resolve,1500));
  }
  this.record(ids,name+' / '+(results.every(r=>r.ok)?'受付完了':'一部未完了'));return {ok:results.every(r=>r.ok),result:results.map(r=>`Bot${r.id}: ${r.result}`).join('\n').slice(0,16000),results};
 }
 async handle(req,res){
  this.headers(res);
  try{
   const url=new URL(req.url,'http://localhost'),pathname=url.pathname;
   if(pathname==='/health'){const ready=!this.closed&&this.ready();this.json(res,ready?200:503,{ok:!!ready});return;}
   if(!this.enabled)throw fail(404,'Web管理はOFFです');
   if(req.method==='GET'&&['/assets/items.png','/assets/items.json'].includes(pathname)){const file=path.join(__dirname,'..','web',pathname.endsWith('.png')?'items.png':'items.json');if(!fs.existsSync(file))throw fail(404,'アイテム画像が未配置です');res.writeHead(200,{'Content-Type':pathname.endsWith('.png')?'image/png':'application/json; charset=utf-8'});res.end(fs.readFileSync(file));return;}
   if(req.method==='GET'&&this.assets.has(pathname)){const asset=this.assets.get(pathname);res.writeHead(200,{'Content-Type':asset.type});res.end(asset.buffer);return;}
   if(this.closed)throw Object.assign(fail(503,'サーバー更新中です。保存したログインで再接続します'),{code:'RESTARTING'});
   if(pathname==='/api/login-info'&&req.method==='GET'){this.json(res,200,{discordReady:this.discordLogin.ready(),callbackURL:this.base?this.discordLogin.redirect():null});return;}
   if(pathname==='/api/oauth/start'&&req.method==='GET'){this.discordLogin.start(req,res);return;}
   if(pathname==='/oauth/discord/callback'&&req.method==='GET'){await this.discordLogin.callback(req,res,url);return;}
   if(pathname==='/api/login'&&req.method==='POST'){await this.login(req,res);return;}
   if(!pathname.startsWith('/api/'))throw fail(404,'ページがありません');
   const session=this.authenticate(req);
   if(req.method==='GET'){
    if(pathname==='/api/state'){this.renew(req,res,session);this.json(res,200,{...this.snapshot(),csrf:session.csrf,owner:session.label,profile:this.publicProfile(session),isOwner:(session.discordId||session.owner)===this.owner,appearance:require('./appearance').preferences(this.manager.store,session.discordId||session.owner),storage:{directory:this.manager.store.dir,persistent:!!this.env.RAILWAY_VOLUME_MOUNT_PATH&&require('node:path').relative(this.env.RAILWAY_VOLUME_MOUNT_PATH,this.manager.store.dir).split(require('node:path').sep)[0]!=='..',backupOwnerOnly:true}});return;}
    if(/^\/api\/media\/(wallpaper|click|notify)$/.test(pathname)){const asset=require('./appearance').media(this.manager.store,session.discordId||session.owner,pathname.split('/').pop());if(!asset)throw fail(404,'ファイルがありません');res.writeHead(200,{'Content-Type':asset.type});res.end(asset.data);return;}
    if(pathname==='/api/events'){
     if(this.events.size>=12)throw fail(429,'開いている画面を減らしてください');
     res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Connection':'keep-alive','X-Accel-Buffering':'no'});
     const connection={res,key:session.key};this.events.add(connection);res.write('event: state\ndata: '+JSON.stringify(this.snapshot())+'\n\n');
     res.on('close',()=>this.events.delete(connection));return;
    }
    if(pathname==='/api/auth'){const ids=this.targets(url.searchParams.get('target'));if(ids.length!==1)throw fail(400,'Botを1体選んでください');this.json(res,200,{message:this.manager.authStatus(ids[0]),authentication:this.manager.authentication?.(ids[0])||null});return;}
    if(pathname==='/api/report'){
     const ids=this.targets(url.searchParams.get('target'));
     const panel=new(require('./panel').ControlPanel)(this.manager,this.owner);const report=panel.diagnostic({target:ids.length===1?String(ids[0]):'all'});
     report.bots=report.bots.filter(b=>ids.includes(b.number));res.setHeader('Content-Disposition','attachment; filename="bot-report.json"');this.json(res,200,report);return;
    }
    if(pathname==='/api/view'){
     const ids=this.targets(url.searchParams.get('target'));if(ids.length!==1)throw fail(400,'Botを1体選んでください');
     const last=this.viewAt.get(ids[0])||0;if(this.now()-last<2000)throw fail(429,'視点の更新は2秒空けてください');this.viewAt.set(ids[0],this.now());
     const image=require('./view').renderView(this.manager.worker(ids[0]).bot);res.setHeader('X-View-Captured-At',String(this.now()));res.writeHead(200,{'Content-Type':'image/png'});res.end(image.buffer);return;
    }
   }
   if(req.method!=='POST')throw fail(404,'操作がありません');this.mutate(req,session);
   if(pathname==='/api/logout'){this.sessions.delete(session.key);this.persistSessions([session.key]);res.setHeader('Set-Cookie',this.cookie(req,'',0));this.json(res,200,{ok:true});this.pump();return;}
   if(pathname==='/api/appearance'){const data=await body(req,12*1024*1024),appearance=await this.once(req,session,()=>require('./appearance').update(this.manager.store,session.discordId||session.owner,data));this.json(res,200,{ok:true,appearance});return;}
   if(pathname==='/api/backup'){this.requireOwner(session);const data=await body(req,36*1024*1024),result=await this.once(req,session,()=>{const backup=require('./backup');if(data.action==='export')return {ok:true,backup:backup.exported(this.manager,data.password)};if(data.action==='restore'){backup.restored(this.manager,data.password,data.backup);this.record([],'暗号化バックアップを復元');return {ok:true,result:'アカウント・設定・壁紙・音声を復元しました'};}throw fail(400,'バックアップ操作を選んでください');});this.json(res,200,result);return;}
   if(pathname==='/api/command'){const data=await body(req);const result=await this.once(req,session,()=>this.command(data));this.json(res,200,result);return;}
   if(pathname==='/api/messaging'){const data=await body(req,128*1024),result=await this.once(req,session,()=>{const ids=this.targets(data.target),settings=require('./messaging').configure(this.manager,ids,data.section,data.settings||{});this.record(ids,'チャット設定: '+data.section);return {ok:true,settings,result:'選択したBotへ設定を保存しました。重複する自動通知は1体が担当します'};});this.json(res,200,result);this.requestPump();return;}
   if(pathname==='/api/chat'){
    const data=await body(req),result=await this.once(req,session,async()=>{const ids=this.targets(data.target);if(!['public','whisper'].includes(data.type))throw fail(400,'送信先を選んでください');const results=[];for(const id of ids){try{results.push({id,ok:true,result:data.type==='public'?this.manager.say(String(id),data.message):this.manager.whisper(String(id),data.recipient,data.message)});}catch(e){results.push({id,ok:false,result:e.message});}}this.record(ids,data.type==='public'?'公開チャット':'tell');return {ok:results.every(r=>r.ok),result:results.map(r=>`Bot${r.id}: ${r.result}`).join('\n')};});this.json(res,200,result);return;
   }
   if(pathname==='/api/restock'){
    const data=await body(req),result=await this.once(req,session,async()=>{const ids=this.targets(data.target);if(ids.length!==1||typeof data.approve!=='boolean')throw fail(400,'対象と許可・見送りを選んでください');const r=this.manager.worker(ids[0]).runtime;const message=r.restock.decide(String(data.id||''),data.approve);this.record(ids,data.approve?'今回の補充を許可':'今回の補充を見送り');return {ok:true,result:message};});this.json(res,200,result);return;
   }
   if(pathname==='/api/auth'){
    const data=await body(req),result=await this.once(req,session,async()=>{const ids=this.targets(data.target);if(ids.length!==1)throw fail(400,'認証はBotを1体選んでください');const authentication=data.fresh===true?this.manager.reauthenticate(ids[0]):this.manager.requestConnection?this.manager.requestConnection(ids[0]):this.manager.login(ids[0]);this.record(ids,'Minecraft認証');return {ok:true,authentication,message:this.manager.authStatus(ids[0])};});this.json(res,200,result);return;
   }
   if(pathname==='/api/accounts'){const data=await body(req),result=await this.once(req,session,()=>{const account=require('./account-slots').add(this.manager,data.name,data.realm);this.record([account.id],'アカウントを追加');return {ok:true,account};});this.json(res,200,result);this.requestPump();return;}
   if(pathname==='/api/account'){
    const data=await body(req),result=await this.once(req,session,async()=>{const ids=this.targets(data.target),name=String(data.name||'').trim();if(ids.length!==1||!name||name.length>64||/[\x00-\x1f]/.test(name))throw fail(400,'単体Botとゲーマータグを指定してください');const message=await this.manager.execute(String(ids[0]),'account set '+name,'web');this.record(ids,'Minecraftアカウント変更');return {ok:true,result:message};});this.json(res,200,result);return;
   }
   if(pathname==='/api/inventory'){
    const data=await body(req),result=await this.once(req,session,()=>this.inventoryAction(data));this.json(res,200,result);return;
   }
   if(pathname==='/api/equip'){
    const data=await body(req);const result=await this.once(req,session,async()=>{const ids=this.targets(data.target),slot=Number(data.slot);if(ids.length!==1||!Number.isInteger(slot)||slot<0||slot>35)throw fail(400,'Botとスロットを選んでください');const bot=this.manager.worker(ids[0]).bot;if(!bot.items[slot])throw fail(400,'そのスロットは空です');const runtime=this.manager.worker(ids[0]).runtime;if(runtime)runtime.manualSlotsUntil=Date.now()+30000;await bot.equip(slot);this.record(ids,'アイテムを選択');return {ok:true,result:'アイテムの持ち替えを送信しました'};});this.json(res,200,result);return;
   }
   throw fail(404,'操作がありません');
  }catch(e){if(res.headersSent){res.end();return;}this.json(res,e.status||(e.code==='HAND_BUSY'?409:400),{ok:false,error:String(e.message||'操作できません').slice(0,1000),...(e.code==='RESTARTING'||e.code==='CSRF_STALE'?{code:e.code}:{})});}
 }
 async inventoryAction(data){
  const ids=this.targets(data.target),from=Number(data.from),to=Number(data.to);if(ids.length!==1||!Number.isInteger(from)||from<0||from>35||!['swap','drop'].includes(data.action))throw fail(400,'Botとスロットを指定してください');
  if(data.action==='swap'&&(!Number.isInteger(to)||to<0||to>35||to===from))throw fail(400,'移動先のスロットを指定してください');
  const w=this.manager.worker(ids[0]),b=w.bot;if(b.handUse||b.manualInventoryBusy||b.window||w.runtime?.restock?.running)throw fail(409,'飲食・箱の操作が終わってから実行してください');
  if(w.runtime){w.runtime.manualSlotsUntil=Date.now()+30000;w.runtime.combatAbort?.abort();}b.manualInventoryBusy=true;b.manualInventoryOperation={action:data.action,from,to,at:Date.now()};this.requestPump();let lease;
  try{
   if(w.runtime?.meleeTask)await w.runtime.meleeTask.catch(()=>{});await b.equipmentTail;await b.inventoryTail;if(b.actionHandBusy&&b.waitUntil)await b.waitUntil(()=>!b.actionHandBusy,1200);lease={slot:b.quickBarSlot,manual:true};b.actionHandBusy=lease;await b.openInventory();
   if(!b.items[from]||!sameToken(data.fromToken,itemToken(b.items[from]))||data.action==='swap'&&!sameToken(data.toToken,itemToken(b.items[to])))throw fail(409,'所持品が更新されました。アイテムを選び直してください');
   if(data.action==='drop'){const count=Number(data.count);if(!Number.isInteger(count)||count<1||count>b.items[from].count)throw fail(400,'捨てる個数を指定してください');await b.drop(from,count);}
   else await b.swap(from,to);
   this.record(ids,data.action==='swap'?'アイテム枠を交換':'アイテムを捨てる');this.requestPump();const updated=this.snapshot().bots.find(v=>v.id===ids[0]);updated.inventorySync.manual=null;return {ok:true,bot:updated,result:data.action==='swap'?'アイテム枠の交換をサーバーで確認しました。AutoSlotは30秒待ちます':'アイテムの破棄をサーバーで確認しました'};
  }finally{b.closeContainer();b.manualInventoryBusy=false;b.manualInventoryOperation=null;if(b.actionHandBusy===lease)b.actionHandBusy=false;this.requestPump();}
 }
 requestPump(){if(this.closed||this.pumpSoon)return;this.pumpSoon=setTimeout(()=>{this.pumpSoon=null;this.pump();},40);this.pumpSoon.unref?.();}
 pump(){
  const now=this.now();for(const [key,value]of this.codes)if(value.expires<=now)this.codes.delete(key);
  for(const [key,value]of this.attempts)if(value.until<=now)this.attempts.delete(key);
  for(const [key,value]of this.requests)if(now-value.at>600000)this.requests.delete(key);
  for(const [key,value]of this.sessions)if(value.expires<=now)this.sessions.delete(key);
  if(!this.events.size)return;
  let packet;for(const connection of this.events){const {res,key}=connection;if(this.sessionRepository.revoked(key)||!this.sessions.has(key)||!this.isAllowed(this.sessions.get(key)?.discordId||this.sessions.get(key)?.owner)){res.write('event: expired\ndata: {}\n\n');res.end();this.events.delete(connection);continue;}
   if(res.writableLength>262144){res.end();this.events.delete(connection);continue;}
   packet??='event: state\ndata: '+JSON.stringify(this.snapshot())+'\n\n';res.write(packet);
  }
 }
 close(){if(this.closed)return;try{this.persistSessions();}catch{}this.closed=true;clearTimeout(this.pumpSoon);this.manager.stateSubscribers?.delete(this.onStateChange);clearInterval(this.timer);this.codes.clear();this.sessions.clear();this.requests.clear();for(const {res}of this.events)res.end();this.events.clear();}
}
module.exports={WebControl,itemToken,baseURL,cleanCode,redact};
