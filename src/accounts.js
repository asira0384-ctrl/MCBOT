'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {norm}=require('./util');
const accountKey=name=>crypto.createHash('sha256').update(norm(name)).digest('hex').slice(0,16);
function authDirectory(store,id,name){return path.join(store.dir,'auth',String(id),accountKey(name));}
function refreshSaved(directory){
 try{return fs.readdirSync(directory).filter(n=>/_(?:live|sisu)-cache\.json$/.test(n)).some(n=>{try{const v=JSON.parse(fs.readFileSync(path.join(directory,n),'utf8'));return typeof v.token?.refresh_token==='string'&&v.token.refresh_token.length>0;}catch{return false;}});}catch{return false;}
}
function storageInfo(dir,env=process.env){
 const actual=path.resolve(dir),mount=env.RAILWAY_VOLUME_MOUNT_PATH&&path.resolve(env.RAILWAY_VOLUME_MOUNT_PATH),railway=!!(env.RAILWAY_PROJECT_ID||env.RAILWAY_ENVIRONMENT_ID||env.RAILWAY_SERVICE_ID);
 let mounted=false;try{mounted=fs.readFileSync('/proc/self/mountinfo','utf8').split('\n').some(line=>{const p=line.split(' ')[4]?.replace(/\\040/g,' ');return p&&p!=='/'&&(actual===p||actual.startsWith(p+'/'))&&(mount?p===mount:p===actual);});}catch{}
 return {path:actual,persistent:railway?!!mounted:null,message:railway?(mounted?'Volume内に認証を保存':'認証の永続保存を確認できません。Railway VolumeをDATA_DIRにマウントしてください'):'このPCのDATA_DIRに認証を保存'};
}
class Accounts{
 constructor(store,options={}){this.store=store;this.jobs=new Map();this.flows=new Map();this.Flow=options.Flow;this.onChange=options.onChange||(()=>{});this.run=options.run||require('./auth-network').run;}
 directory(id,name){return authDirectory(this.store,id,name);}
 record(id,name,profile){if(!profile?.name||norm(profile.name)!==norm(name)){const dir=this.directory(id,name);if(profile?.name&&fs.existsSync(dir)){fs.renameSync(dir,dir+'.wrong-'+Date.now());this.flows.delete(id);}throw Error(`認証したアカウントが違います: ${profile?.name||'不明'} / 設定: ${name}`);}const s=this.store.bot(id);s.authAccounts??={};s.authAccounts[accountKey(name)]={name:profile.name,verifiedAt:Date.now()};this.store.save();}
 snapshot(id,name){const job=this.jobs.get(id),same=job?.name===norm(name),record=this.store.bot(id).authAccounts?.[accountKey(name)],saved=refreshSaved(this.directory(id,name));
  return {state:same?(job.state==='waiting'&&job.code?.expires<=Date.now()?'expired':job.state):saved?'saved':'required',saved,profile:record?.name||null,verifiedAt:record?.verifiedAt||null,code:same&&job.code&&job.code.expires>Date.now()?{value:job.code.user_code,url:'https://www.microsoft.com/link',expires:job.code.expires}:null,error:same?job.error||null:null,storage:storageInfo(this.store.dir)};
 }
 flow(id,name){const record=this.flows.get(id);return record?.name===norm(name)?record.flow:undefined;}
 start(id,name){
  const previous=this.jobs.get(id);if(previous&&previous.name===norm(name)&&(previous.state==='checking'||previous.state==='waiting'&&previous.code?.expires>Date.now()))return this.snapshot(id,name);
  this.cancel(id);const directory=this.directory(id,name);fs.mkdirSync(directory,{recursive:true,mode:0o700});
  const controller=new AbortController(),job={name:norm(name),state:'checking',controller};this.jobs.set(id,job);
  const current=()=>this.jobs.get(id)===job&&!controller.signal.aborted;
  const {Authflow,Titles}=require('prismarine-auth'),Flow=this.Flow||Authflow;
  let flow;try{flow=new Flow(`asira-bot-${id}`,directory,{flow:'live',authTitle:Titles.MinecraftNintendoSwitch,deviceType:'Nintendo',deviceOS:12},code=>{if(!current())return;job.code={...code,expires:Date.now()+(code.expires_in||900)*1000};job.state='waiting';this.onChange(id,'Microsoft認証待ち。Webの認証ボタンまたは /auth でコードを確認してください');});}catch(error){job.state='failed';job.error=error.message;controller.abort();return this.snapshot(id,name);}
  this.flows.set(id,{name:norm(name),flow});job.flow=flow;
  const timer=setTimeout(()=>{if(current()){controller.abort();if(flow.msa)flow.msa.polling=false;job.state='failed';job.error='認証が15分で完了しませんでした。認証ボタンから再開してください';job.code=null;}},900000);timer.unref?.();
  job.promise=this.run({signal:controller.signal,closed:()=>!current(),notify:text=>this.onChange(id,text)},async()=>{
   const key=crypto.generateKeyPairSync('ec',{namedCurve:'secp384r1'}).publicKey.export({format:'der',type:'spki'}).toString('base64');
   const result=await flow.getMinecraftBedrockToken(key);if(!current())return;
   const data=JSON.parse(Buffer.from(result.chain?.[1]?.split('.')[1]||'','base64url').toString());
   this.record(id,name,{name:data.extraData?.displayName});
   for(const file of fs.readdirSync(directory))if(file.endsWith('-cache.json'))fs.chmodSync(path.join(directory,file),0o600);
   if(!refreshSaved(directory))throw Error('Microsoft認証は完了しましたが保存用の認証情報を確認できません');
   job.state='ready';job.code=null;this.onChange(id,'認証して保存しました。「接続」でMinecraftへ入れます');
  }).catch(error=>{if(!current())return;job.state='failed';job.code=null;job.error=require('./auth-network').details(error)||error.message;this.flows.delete(id);this.onChange(id,'認証失敗: '+job.error);}).finally(()=>clearTimeout(timer));
  return this.snapshot(id,name);
 }
 cancel(id){const job=this.jobs.get(id);if(job){job.controller.abort();if(job.flow?.msa)job.flow.msa.polling=false;}this.jobs.delete(id);this.flows.delete(id);}
 destroy(){for(const id of this.jobs.keys())this.cancel(id);}
}
module.exports={Accounts,authDirectory,refreshSaved,storageInfo};
