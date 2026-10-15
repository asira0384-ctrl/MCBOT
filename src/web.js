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
const itemToken=raw=>digest(raw?[raw.network_id,raw.metadata||0,raw.stack_id||0,raw.count||0].join(':'):'empty');
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
async function body(req){
 if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))throw fail(415,'JSON形式で送信してください');
 let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>8192)throw fail(413,'送信内容が長すぎます');chunks.push(chunk);}
 try{const value=JSON.parse(Buffer.concat(chunks).toString());if(!value||typeof value!=='object'||Array.isArray(value))throw Error();return value;}catch{throw fail(400,'JSONの内容が不正です');}
}
class WebControl{
 constructor(manager,options={}){
  this.manager=manager;this.owner=String(options.owner||OWNER);this.env=options.env||process.env;this.now=options.now||Date.now;this.enabled=this.env.WEB_ENABLED!=='false';this.ready=options.ready||(()=>true);
  this.loginTTL=options.loginTTL||120000;this.sessionTTL=options.sessionTTL||30*24*3600000;
  this.base=baseURL(options.baseURL||this.env.WEB_BASE_URL||manager.store.data.webBaseURL||(this.env.RAILWAY_PUBLIC_DOMAIN?'https://'+this.env.RAILWAY_PUBLIC_DOMAIN:''));
  this.codes=new Map();this.sessions=new Map();this.attempts=new Map();this.events=new Set();this.closed=false;this.audit=[];this.requests=new Map();this.viewAt=new Map();
  const directory=path.join(__dirname,'..','web');this.assets=new Map([
   ['/',{type:'text/html; charset=utf-8',buffer:fs.readFileSync(path.join(directory,'index.html'))}],
   ['/assets/app.css',{type:'text/css; charset=utf-8',buffer:fs.readFileSync(path.join(directory,'app.css'))}],
   ['/assets/app.js',{type:'text/javascript; charset=utf-8',buffer:fs.readFileSync(path.join(directory,'app.js'))}],
   ['/favicon.svg',{type:'image/svg+xml',buffer:fs.readFileSync(path.join(directory,'favicon.svg'))}]
  ]);
  for(const v of manager.store.data.webSessions||[])if(v.owner===this.owner&&/^[a-f0-9]{64}$/.test(v.key)&&v.expires>this.now()&&typeof v.csrf==='string')this.sessions.set(v.key,{csrf:v.csrf,expires:v.expires,label:String(v.label||'Asira').slice(0,80),owner:this.owner});
  this.timer=setInterval(()=>this.pump(),1000);this.timer.unref?.();
 }
 persistSessions(){this.manager.store.data.webSessions=[...this.sessions].slice(-5).map(([key,s])=>({key,csrf:s.csrf,expires:s.expires,label:s.label,owner:this.owner}));this.manager.store.save();}
 configureURL(actor,value){if(String(actor)!==this.owner)throw fail(403,'本人のみ設定できます');this.base=baseURL(value);this.manager.store.data.webBaseURL=this.base;this.manager.store.save();return this.base;}
 issueLogin(actor,label='Asira'){
  if(this.closed)throw Error('再起動中です。少し待ってください');
  if(!this.enabled)throw Error('Web管理はOFFです。WEB_ENABLED=falseを解除してください');
  if(String(actor)!==this.owner)throw fail(403,'本人のみログインできます');
  if(!this.base)throw Error('RailwayでGenerate Domainを実行してから /web url:https://取得したドメイン を実行してください');
  const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',code=[...crypto.randomBytes(12)].map(n=>alphabet[n&31]).join('');
  this.codes.clear();this.codes.set(digest(code),{expires:this.now()+this.loginTTL,label:String(label).slice(0,80)});
  return {url:this.base+'/#login='+code,code:code.slice(0,6)+'-'+code.slice(6),expiresInSeconds:this.loginTTL/1000};
 }
 loginMessage(actor,label){const login=this.issueLogin(actor,label);return {content:`[Web管理画面を開く](${login.url})\n本人専用・一度限り・2分間有効です。\n手入力する場合のコード: **${login.code}**`,allowedMentions:{parse:[]}};}
 targets(value){
  const target=String(value||'');if(target==='2b2e')return [...this.manager.names.keys()].filter(n=>n!==11);if(target==='ign')return this.manager.names.has(11)?[11]:[];
  if(target!=='all'&&!/^(?:[1-9]|10|11)$/.test(target))throw fail(400,'Bot番号またはグループを選んでください');
  return this.manager.targets(target);
 }
 snapshot(){
  const names=this.manager.names,bots=[...names].map(([id,name])=>{
   const w=this.manager.workers.get(id),b=w?.bot,state=this.manager.store.bot(id),r=w?.runtime?.snapshot?.(),p=b?.entity?.position;
   const item=(raw,slot)=>({slot,name:raw?(b?.name?.(raw)||raw.name||'unknown'):'',count:raw?.count||0,damage:raw?(b?.damage?.(raw)||0):0,token:itemToken(raw),selected:slot===b?.quickBarSlot});
   return {id,name,server:id===11?'ign':'2b2e',connected:!!b?.connected,dead:!!b?.dead,phase:b?.connectionPhase||'未接続',mode:w?.mode||'offline',health:b?.health??null,
    endpoint:{host:b?.config?.host||(id===11?this.env.IGN_HOST:this.env.MC_HOST)|| (id===11?'IGN未設定':'2b2e.org'),port:b?.config?.port||Number((id===11?this.env.IGN_PORT:this.env.MC_PORT)||19132)},
    position:p?{x:p.x,y:p.y,z:p.z}:null,dimension:b?.dimensionId??0,config:{...defaults,...state.runtime},
    options:{respawn:state.respawn,autoSupply:state.autoSupply,chat:state.chat,floor:state.floor,ceiling:state.ceiling,area:state.area,scaffold:state.scaffold},
    inventory:Array.from({length:36},(_,n)=>item(b?.items?.[n],n)),armor:Array.from({length:4},(_,n)=>item(b?.armor?.[n],n)),offhand:item(b?.offhand?.[0],-1),
    bps:r?.telemetry?.bps||0,verticalBps:r?.telemetry?.verticalBps||0,restock:r?.restock||null,nearby:w?.runtime?.telemetry?require('./tactics').nearby(w.runtime):[],accounts:state.accountHistory||[name],authCacheSaved:b?.config?.authDir?fs.readdirSync(b.config.authDir).length>0:false,runtime:r?{rollbackRecovery:r.rollbackRecovery,paused:r.paused,operation:r.operation,movement:r.movement,target:r.target,combatWaiting:r.combatWaiting,attacksSent:r.attacksSent,totemsUsed:r.totemsUsed,consumption:r.consumption,lastItemUse:r.lastItemUse,crystalCombat:r.crystalCombat,featureErrors:r.featureErrors,lastError:r.lastError}:null,
    packetsReceived:Object.values(b?.packetCounts||{}).reduce((a,n)=>a+Number(n||0),0),corrections:b?.positionCorrections||0,logs:(this.manager.logs.get(id)||[]).slice(-30).map(redact)};
  });
  return {version:require('../package.json').version,at:this.now(),bots,friends:(this.manager.store.data.friends||[]).map(e=>e.name),enemies:(this.manager.store.data.enemies||[]).map(e=>e.name),audit:this.audit.slice(-30)};
 }
 session(req){
  const cookie=String(req.headers.cookie||'').split(';').map(p=>p.trim()).find(p=>p.startsWith(COOKIE+'='));if(!cookie)return null;
  const key=digest(cookie.slice(COOKIE.length+1)),session=this.sessions.get(key);if(!session||session.expires<=this.now()){this.sessions.delete(key);return null;}return {...session,key};
 }
 ip(req){return req.socket.remoteAddress||'local';}
 origin(req){return this.base||((req.socket.encrypted?'https':'http')+'://'+req.headers.host);}
 checkOrigin(req){if(req.headers.origin&&req.headers.origin!==this.origin(req))throw fail(403,'別のサイトからの操作は受け付けません');}
 headers(res){
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'");
 }
 cookie(req,value,seconds){const secure=this.origin(req).startsWith('https:');return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${seconds}${secure?'; Secure':''}`;}
 json(res,status,value){if(res.writableEnded)return;res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value,(_,v)=>typeof v==='bigint'?String(v):v));}
 authenticate(req){const session=this.session(req);if(!session)throw fail(401,'Discordの /web からログインしてください');return session;}
 mutate(req,session){this.checkOrigin(req);if(!sameToken(req.headers['x-csrf-token'],session.csrf))throw fail(403,'画面を再読み込みしてから操作してください');}
 async login(req,res){
  this.checkOrigin(req);const ip=this.ip(req),now=this.now(),previous=this.attempts.get(ip);
  if(previous&&previous.until>now&&previous.count>=8){res.setHeader('Retry-After','60');throw fail(429,'少し待ってから /web で新しいリンクを発行してください');}
  this.attempts.set(ip,{count:previous&&previous.until>now?previous.count+1:1,until:previous&&previous.until>now?previous.until:now+60000});
  const {code}=await body(req),normalized=cleanCode(code),entry=this.codes.get(digest(normalized));
  if(!/^[A-HJ-NP-Z2-9]{12}$/.test(normalized)||!entry||entry.expires<=now)throw fail(401,'リンクが使用済みか期限切れです。Discordの /web から開き直してください');
  this.codes.delete(digest(normalized));this.attempts.delete(ip);
  for(const [key,value]of this.sessions)if(value.expires<=now)this.sessions.delete(key);
  if(this.sessions.size>=5)this.sessions.delete(this.sessions.keys().next().value);
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
  const results=[];for(const [index,id]of ids.entries()){
   if(this.closed)throw fail(503,'終了処理中のため残りの操作を中止しました');
   try{results.push({id,ok:true,result:await this.manager.execute(String(id),command,'web')});}catch(e){results.push({id,ok:false,result:String(e.message)});}
   if(name==='connect'&&index<ids.length-1)await new Promise(resolve=>setTimeout(resolve,1500));
  }
  this.record(ids,name+' / '+(results.every(r=>r.ok)?'受付完了':'一部未完了'));return {ok:results.every(r=>r.ok),result:results.map(r=>`Bot${r.id}: ${r.result}`).join('\n').slice(0,16000),results};
 }
 async handle(req,res){
  this.headers(res);
  try{
   const url=new URL(req.url,'http://localhost'),pathname=url.pathname;
   if(pathname==='/health'){this.json(res,this.ready()?200:503,{ok:!!this.ready()});return;}
   if(!this.enabled)throw fail(404,'Web管理はOFFです');
   if(req.method==='GET'&&['/assets/items.png','/assets/items.json'].includes(pathname)){const file=path.join(__dirname,'..','web',pathname.endsWith('.png')?'items.png':'items.json');if(!fs.existsSync(file))throw fail(404,'アイテム画像が未配置です');res.writeHead(200,{'Content-Type':pathname.endsWith('.png')?'image/png':'application/json; charset=utf-8'});res.end(fs.readFileSync(file));return;}
   if(req.method==='GET'&&this.assets.has(pathname)){const asset=this.assets.get(pathname);res.writeHead(200,{'Content-Type':asset.type});res.end(asset.buffer);return;}
   if(pathname==='/api/login'&&req.method==='POST'){await this.login(req,res);return;}
   if(!pathname.startsWith('/api/'))throw fail(404,'ページがありません');
   const session=this.authenticate(req);
   if(req.method==='GET'){
    if(pathname==='/api/state'){this.json(res,200,{...this.snapshot(),csrf:session.csrf,owner:session.label});return;}
    if(pathname==='/api/events'){
     if(this.events.size>=12)throw fail(429,'開いている画面を減らしてください');
     res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Connection':'keep-alive','X-Accel-Buffering':'no'});
     const connection={res,key:session.key};this.events.add(connection);res.write('event: state\ndata: '+JSON.stringify(this.snapshot())+'\n\n');
     res.on('close',()=>this.events.delete(connection));return;
    }
    if(pathname==='/api/auth'){const ids=this.targets(url.searchParams.get('target'));if(ids.length!==1)throw fail(400,'Botを1体選んでください');this.json(res,200,{message:this.manager.authStatus(ids[0])});return;}
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
   if(pathname==='/api/logout'){this.sessions.delete(session.key);this.persistSessions();res.setHeader('Set-Cookie',this.cookie(req,'',0));this.json(res,200,{ok:true});this.pump();return;}
   if(pathname==='/api/command'){const data=await body(req);const result=await this.once(req,session,()=>this.command(data));this.json(res,200,result);return;}
   if(pathname==='/api/chat'){
    const data=await body(req),result=await this.once(req,session,async()=>{const ids=this.targets(data.target);if(!['public','whisper'].includes(data.type))throw fail(400,'送信先を選んでください');const results=[];for(const id of ids){try{results.push({id,ok:true,result:data.type==='public'?this.manager.say(String(id),data.message):this.manager.whisper(String(id),data.recipient,data.message)});}catch(e){results.push({id,ok:false,result:e.message});}}this.record(ids,data.type==='public'?'公開チャット':'tell');return {ok:results.every(r=>r.ok),result:results.map(r=>`Bot${r.id}: ${r.result}`).join('\n')};});this.json(res,200,result);return;
   }
   if(pathname==='/api/restock'){
    const data=await body(req),result=await this.once(req,session,async()=>{const ids=this.targets(data.target);if(ids.length!==1||typeof data.approve!=='boolean')throw fail(400,'対象と許可・見送りを選んでください');const r=this.manager.worker(ids[0]).runtime;const message=r.restock.decide(String(data.id||''),data.approve);this.record(ids,data.approve?'今回の補充を許可':'今回の補充を見送り');return {ok:true,result:message};});this.json(res,200,result);return;
   }
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
  }catch(e){if(res.headersSent){res.end();return;}this.json(res,e.status||(e.code==='HAND_BUSY'?409:400),{ok:false,error:String(e.message||'操作できません').slice(0,1000)});}
 }
 async inventoryAction(data){
  const ids=this.targets(data.target),from=Number(data.from),to=Number(data.to);if(ids.length!==1||!Number.isInteger(from)||from<0||from>35||!['swap','drop'].includes(data.action))throw fail(400,'Botとスロットを指定してください');
  if(data.action==='swap'&&(!Number.isInteger(to)||to<0||to>35||to===from))throw fail(400,'移動先のスロットを指定してください');
  const w=this.manager.worker(ids[0]),b=w.bot;if(b.handUse||b.manualInventoryBusy||b.window||w.runtime?.restock?.running)throw fail(409,'飲食・箱の操作が終わってから実行してください');
  if(w.runtime)w.runtime.manualSlotsUntil=Date.now()+30000;b.manualInventoryBusy=true;b.actionHandBusy=true;
  try{
   await b.inventoryTail;await b.openInventory();
   if(!b.items[from]||!sameToken(data.fromToken,itemToken(b.items[from]))||data.action==='swap'&&!sameToken(data.toToken,itemToken(b.items[to])))throw fail(409,'所持品が更新されました。アイテムを選び直してください');
   if(data.action==='drop'){const count=Number(data.count);if(!Number.isInteger(count)||count<1||count>b.items[from].count)throw fail(400,'捨てる個数を指定してください');await b.drop(from,count);}
   else await b.swap(from,to);
   this.record(ids,data.action==='swap'?'アイテム枠を交換':'アイテムを捨てる');return {ok:true,result:data.action==='swap'?'アイテム枠の交換をサーバーで確認しました。AutoSlotは30秒待ちます':'アイテムの破棄をサーバーで確認しました'};
  }finally{b.closeContainer();b.manualInventoryBusy=false;b.actionHandBusy=false;}
 }
 pump(){
  const now=this.now();for(const [key,value]of this.codes)if(value.expires<=now)this.codes.delete(key);
  for(const [key,value]of this.attempts)if(value.until<=now)this.attempts.delete(key);
  for(const [key,value]of this.requests)if(now-value.at>600000)this.requests.delete(key);
  for(const [key,value]of this.sessions)if(value.expires<=now)this.sessions.delete(key);
  if(!this.events.size)return;
  let packet;for(const connection of this.events){const {res,key}=connection;if(!this.sessions.has(key)){res.write('event: expired\ndata: {}\n\n');res.end();this.events.delete(connection);continue;}
   if(res.writableLength>262144){res.end();this.events.delete(connection);continue;}
   packet??='event: state\ndata: '+JSON.stringify(this.snapshot())+'\n\n';res.write(packet);
  }
 }
 close(){this.closed=true;clearInterval(this.timer);this.codes.clear();this.sessions.clear();this.requests.clear();for(const {res}of this.events)res.end();this.events.clear();}
}
module.exports={WebControl,itemToken,baseURL,cleanCode,redact};
