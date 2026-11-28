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
function log(a,stage){events.push({time:new Date().toISOString(),server:a.server,id:a.id,stage});if(events.length>3000)events.shift();}
function connect(a){
 const k=a.server+'/'+a.id;
 if(sessions.has(k))return;
 const {Versions}=require('bedrock-protocol/src/options');
 const version=Object.keys(Versions).find(v=>Number(Versions[v])===686);
 if(!version) throw Error('Bedrock 1.21.2 (protocol 686) unsupported by installed codec');
 const client=bedrock.createClient({version,host:hosts[a.server],port:Number((a.server==='IGN'?process.env.IGN_PORT:process.env.MC_PORT)||19132),offline:true,username:a.id});
 sessions.set(k,client);
 const clear=()=>{if(sessions.get(k)===client)sessions.delete(k)};
 client.on('close',clear);client.on('disconnect',()=>{log(a,'disconnected');clear()});client.on('error',()=>{log(a,'connection error');client.close();clear()});
 let registered=false, sent=false;
 client.on('modal_form_request',p=>{
 try{
 const f=JSON.parse(p.data), title=String(f.title).replace(/§./g,'').trim();
 let value;
 if(f.type==='form'){
 const label=title==='Authentication'?'Offline Login':title==='Offline Login'?(a.create&&!registered?'Offline Registration':'I have an account'):null;
 if(!label)return log(a,'unexpected menu');
 value=f.buttons.findIndex(b=>b.text.replace(/§./g,'').trim()===label);
 if(value<0)return log(a,'missing '+label);
 }else if(f.type==='custom_form'&&['Authentication','Offline Registration'].includes(title)){
 if(sent)return log(a,'repeated authentication prompt');
 const fields=f.content.map(x=>String(x.text).replace(/§./g,'').trim().toLowerCase());
 if(!['username','password'].every(x=>fields.filter((v,i)=>v===x&&f.content[i].type==='input').length===1))return log(a,'unexpected credential fields');
 value=f.content.map((x,i)=>{if(x.type==='label')return null;if(x.type==='toggle')return x.default===true;if(x.type==='input'&&fields[i]==='username')return a.id;if(x.type==='input'&&fields[i]==='password')return open(a);throw Error()});
 if(title==='Offline Registration')registered=true;
 else {sent=true;if(a.create){a.create=false;save()}}
 }else return log(a,'unrecognized form');
 client.queue('modal_form_response',{form_id:p.form_id,has_response_data:true,data:JSON.stringify(value),has_cancel_reason:false});log(a,title+' submitted');
 }catch{log(a,'form processing failed')}
 });
}

exports.control = function(d) {
 const {server,id,password,op}=d;
 if(op==='list')return {accounts:accounts.map(({server,id})=>({server,id}))};
 if(op==='debug')return {report:{version:'1.21.2',events}};
 if(!Object.hasOwn(hosts,server)||!hosts[server])throw Error('接続先を設定してください');
 if(op==='create'){
  if(typeof id!=='string'||!/^[a-zA-Z0-9_]{1,32}$/.test(id)||typeof password!=='string'||password.length<8||password.length>30)throw Error('ID またはパスワードを確認してください');
  if(accounts.some(a=>a.server===server&&a.id.toLowerCase()===id.toLowerCase()))throw Error('登録済みです。Connect で再試行してください');
  const a={id,server,secret:seal(password),create:true};
  accounts.push(a);save();connect(a);
 }else if(op==='connect'||op==='disconnect'){
  for(const a of accounts.filter(a=>a.server===server&&(!id||id===a.id))){
   if(op==='connect')connect(a);else sessions.get(server+'/'+a.id)?.close();
  }
 }else throw Error('Unknown Offlog operation');
 return {result:'受付完了'};
};
