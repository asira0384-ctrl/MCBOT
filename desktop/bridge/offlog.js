'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');
const bedrock = require('bedrock-protocol');
const path = require('node:path');
const dir = path.join(require('../../data/store').dataDirectory(), 'offlog');
fs.mkdirSync(dir,{recursive:true,mode:0o700});
const file = name => path.join(dir,name);
if (!fs.existsSync(file('key'))) fs.writeFileSync(file('key'),crypto.randomBytes(32),{flag:'wx',mode:0o600});
const key = fs.readFileSync(file('key'));
const accounts = fs.existsSync(file('accounts')) ? JSON.parse(fs.readFileSync(file('accounts'))) : [];
const sessions = new Map(), events = [];
const hosts = {'2b2e':process.env.MC_HOST||'2b2e.org',IGN:process.env.IGN_HOST};

function save(){fs.writeFileSync(file('accounts.tmp'),JSON.stringify(accounts),{mode:0o600});fs.renameSync(file('accounts.tmp'),file('accounts'));}
function seal(password){const iv=crypto.randomBytes(12), cipher=crypto.createCipheriv('aes-256-gcm',key,iv);const data=Buffer.concat([cipher.update(password,'utf8'),cipher.final()]);return [iv,cipher.getAuthTag(),data].map(b=>b.toString('base64'));}
function open(account){const [iv,tag,data]=account.secret.map(s=>Buffer.from(s,'base64'));const d=crypto.createDecipheriv('aes-256-gcm',key,iv);d.setAuthTag(tag);return Buffer.concat([d.update(data),d.final()]).toString();}
const progress=new Map();
function log(a,stage){progress.set(a.server+"/"+a.id,stage);events.push({time:new Date().toISOString(),server:a.server,id:a.id,stage});if(events.length>3000)events.shift();}
function connect(a){
 const k=a.server+'/'+a.id;
 if(sessions.has(k))return;
 const {Versions}=require('bedrock-protocol/src/options');
 const version=Object.keys(Versions).find(v=>Number(Versions[v])===686);
 if(!version) throw Error('Bedrock 1.21.2 (protocol 686) unsupported by installed codec');
 log(a,"接続中");
 const client=bedrock.createClient({version,host:hosts[a.server],port:Number((a.server==='IGN'?process.env.IGN_PORT:process.env.MC_PORT)||19132),offline:true,username:a.id});
 sessions.set(k,client);
 const players=new Map();let initialRoster=true,lastGreeting=0;
 client.on('player_list',packet=>{
  const group=packet.records;
  for(const row of Array.isArray(group)?group:group?.records||[]){
   if((row.type||group.type)==='remove'){players.delete(row.uuid);continue}
   const name=String(row.username||'');if(!name||name===a.id)continue;
   const fresh=!players.has(row.uuid);players.set(row.uuid,row);
   if(name.toLowerCase()===a.skinTarget?.toLowerCase())client.applyOffSkin();
   if(fresh&&!initialRoster&&a.greetPlayer?.toLowerCase()===name.toLowerCase()&&Date.now()-lastGreeting>30000){
    lastGreeting=Date.now();const out=require('../../model/chat/delivery/chat-output');
    client.queue('text',out.publicPacket({client,username:a.id},a.greeting.replaceAll('@player',name)));
   }
  }
  initialRoster=false;
 });
 client.applyOffSkin=()=>{
  const row=[...players.values()].find(r=>r.username?.toLowerCase()===a.skinTarget?.toLowerCase());
  const skin=row?.skin_data||row?.skin;
  if(skin?.skin_data&&client.profile?.uuid)client.queue('player_skin',{uuid:client.profile.uuid,skin,skin_name:skin.skin_id,old_skin_name:'',is_verified:false});
 };
 const clear=()=>{if(sessions.get(k)===client)sessions.delete(k)};
 client.on('close',()=>{if(sessions.get(k)===client){log(a,'接続終了');clear()}});client.on('disconnect',packet=>{log(a,'切断されました（理由コード：'+(Number.isInteger(packet.reason)?packet.reason:'不明')+'）');clear()});client.on('error',()=>{log(a,'接続エラー');client.close();clear()});
 let registered=false, sent=false;
 client.on('text',packet=>{
  if(!(registered||sent)||!['system','translation','raw','tip','popup'].includes(packet.type))return;
  const message=String(packet.message||'').replace(/§./g,'');
  const reasons=[[/password.*(?:wrong|incorrect|invalid)|(?:wrong|incorrect|invalid).*password/i,'パスワードが拒否されました'],[/already (?:exists|registered|taken)/i,'このIDは登録済みです'],[/too many|rate limit|try again later/i,'サーバーの再試行制限'],[/not registered|not found/i,'登録済みIDが見つかりません']];
  for(const [pattern,reason] of reasons)if(pattern.test(message)){log(a,reason);return;}
  if(!sent)return;
  if(/successfully (?:logged in|authenticated)|login successful|ログインに成功/i.test(String(packet.message))){
   a.create=false;save();log(a,'ログイン成功');
  }
 });
 client.on('respawn',p=>{
  if(a.respawn && p.state===1)client.queue('respawn',{position:p.position,state:2,runtime_entity_id:p.runtime_entity_id});
 });
 client.on('modal_form_request',p=>{
 try{
 const f=JSON.parse(p.data);
 const clean=x=>String(x||'').replace(/§./g,'').replace(/\s+/g,' ').trim();
 const title=clean(f.title), normalized=title.toLowerCase();
 const labels=f.type==='modal'?[f.button1,f.button2]:(f.buttons||[]).map(b=>b.text);
 const options=labels.map(x=>clean(x).toLowerCase());
 log(a,'画面受信：'+clean(f.type)+' / '+title.slice(0,100)+' / '+options.join(' | ').slice(0,180));
 let value;
 if(f.type==='form'||f.type==='modal'){
 const wanted=options.some(x=>x==='offline login')?'offline login':a.create&&!registered?'offline registration':'i have an account';
 const index=options.findIndex(x=>x===wanted);
 if(index<0)return log(a,'未対応の画面：'+title.slice(0,80));
 value=f.type==='modal'?index===0:index;
 }else if(f.type==='custom_form'&&/authenticat|offline|log.?in|regist/i.test(title)){
 if(sent){
  const notices=f.content.filter(x=>x.type==='label').map(x=>clean(x.text)).join(' ');
  const reason=/incorrect password|wrong password|invalid password/i.test(notices)?'パスワードが一致しません':/unknown user|not registered|account not found/i.test(notices)?'登録したIDが見つかりません':/too many|try again later/i.test(notices)?'サーバーが再試行を制限しています':'理由の通知を識別できません';
  return log(a,'認証画面が再表示：'+reason);
 }
 if(registered && !/regist/i.test(title) && a.create){log(a,'登録送信後、ログイン画面を受信');}
 const fields=f.content.map(x=>String(x.text).replace(/§./g,'').trim().toLowerCase());
 if(!['username','password'].every(x=>fields.filter((v,i)=>v===x&&f.content[i].type==='input').length===1))return log(a,'入力欄を識別できません');
 value=f.content.map((x,i)=>{if(x.type==='label')return null;if(x.type==='toggle')return x.default===true;if(x.type==='input'&&fields[i]==='username')return a.id;if(x.type==='input'&&fields[i]==='password')return open(a);throw Error()});
 if(/regist/i.test(title)){registered=true;log(a,'登録情報を送信');}
 else {sent=true;}
 }else return log(a,'unrecognized form');
 client.queue('modal_form_response',{form_id:p.form_id,has_response_data:true,data:JSON.stringify(value)+'\n',has_cancel_reason:false});log(a,title+' を送信');
 }catch{log(a,'フォーム処理に失敗')}
 });
}

exports.control = function(d) {
 const {server,id,password,op}=d;
 if(op==='list')return {accounts:accounts.map(({server,id})=>({server,id,respawn:!!accounts.find(x=>x.server===server&&x.id===id)?.respawn,stage:progress.get(server+'/'+id)||'保存済み'}))};
 if(op==='debug')return {report:{version:'1.21.2',events}};
 if(!Object.hasOwn(hosts,server)||!hosts[server])throw Error('接続先を設定してください');
 if(op==='remove'){
  const i=accounts.findIndex(a=>a.id===id&&a.server===server);if(i<0)throw Error('対象が見つかりません');
  sessions.get(server+'/'+id)?.close();accounts.splice(i,1);save();return {result:'一覧から削除しました'};
 }
 if(op==='profiles'){
  if(typeof id!=='string'||!id.endsWith('...')||!Number.isInteger(d.count)||d.count<1||d.count>999||typeof password!=='string'||password.length<8||password.length>30||!/[A-Z]/.test(password)||!/[a-z]/.test(password)||!/[0-9]/.test(password))throw Error('Aslrq... / Count 1-999 / Password 8-30');
  const ids=Array.from({length:d.count},(_,i)=>id.slice(0,-3)+String(i+1).padStart(3,'0'));
  if(ids.some(v=>!/^\w{1,32}$/.test(v)||accounts.some(a=>a.server===server&&a.id.toLowerCase()===v.toLowerCase())))throw Error('Invalid or duplicate ID');
  accounts.push(...ids.map(id=>({id,server,secret:seal(password),create:true,draft:true})));save();return {result:'Profiles saved'};
 }
 if(op==='appearance'){
  const a=accounts.find(a=>a.id===id&&a.server===server);if(!a)throw Error('Select one account');
  if(d.kind==='SkinStealer')a.skinTarget=String(d.player||'').slice(0,32);
  else {a.greetPlayer=String(d.player||'').slice(0,32);a.greeting=String(d.message||'Hello @player').slice(0,180)}
  save();sessions.get(server+'/'+id)?.applyOffSkin?.();return {result:'保存済み'};
 }
 if(op==='create'){
  if(typeof id!=='string'||!/^[a-zA-Z0-9_]{1,32}$/.test(id)||typeof password!=='string'||password.length<8||password.length>30||!/[A-Z]/.test(password)||!/[a-z]/.test(password)||!/[0-9]/.test(password))throw Error('IDとパスワードを確認してください。パスワードは8〜30文字、英大文字・小文字・数字が必要です');
  const existing=accounts.find(a=>a.server===server&&a.id.toLowerCase()===id.toLowerCase());if(existing){if(!sessions.has(server+'/'+existing.id)){existing.secret=seal(password);save();connect(existing);return {result:'Retrying'}}throw Error('既存IDです。Stop後に再試行してください');}
  const a={id,server,secret:seal(password),create:true};
  accounts.push(a);save();connect(a);
 }else if(op==='respawn'){
  for(const a of accounts.filter(a=>a.server===server&&(!id||a.id===id)))a.respawn=d.enabled===true;
  save();
 }else if(op==='send'){
  if(!id)throw Error('アカウントを1つ選択してください');
  const client=sessions.get(server+'/'+id);if(!client)throw Error('未接続');
  const output=require('../../model/chat/delivery/chat-output');
  const bot={client,username:id,registry:require('minecraft-data')('bedrock_'+client.options.version)};
  const msg=output.message(d.message+(d.kind==='CustomCommand'?'':(d.suffix||'')));
  if(d.kind==='PublicChat')client.queue('text',output.publicPacket(bot,msg));
  else client.queue('command_request',output.commandPacket(bot,d.kind==='PrivateChat'?'/tell "'+output.name(d.player)+'" '+msg:msg));
 }else if(op==='connect'||op==='disconnect'||op==='stop'){
  for(const a of accounts.filter(a=>a.server===server&&(!id||id===a.id))){
   if(op==='connect'){if(a.draft&&!id)continue;if(a.draft){delete a.draft;save()}connect(a);}else sessions.get(server+'/'+a.id)?.close();
  }
 }else throw Error('Unknown Offlog operation');
 return {result:'受付完了'};
};
