'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {norm}=require('../shared/util');
const accountKey=name=>crypto.createHash('sha256').update(norm(name)).digest('hex').slice(0,16);
function authDirectory(store,id,name){return path.join(store.dir,'auth','accounts',accountKey(name));}
const authUsername=name=>'asira-account-'+accountKey(name);
function bedrockProfile(chain){for(const token of chain||[]){try{const payload=JSON.parse(Buffer.from(token.split('.')[1]||'','base64url').toString());if(typeof payload.extraData?.displayName==='string'&&payload.extraData.displayName.trim())return {name:payload.extraData.displayName};}catch{}}throw Error('Microsoft/Xboxの署名チェーンからゲーマータグを確認できません。認証をやり直してください');}
function migrate(store,name){const directory=authDirectory(store,0,name);fs.mkdirSync(directory,{recursive:true,mode:0o700});const root=path.join(store.dir,'auth'),hash=crypto.createHash('sha1').update(authUsername(name),'binary').digest('hex').slice(0,6);
 const marker=path.join(root,'accounts',accountKey(name)+'.migration.json');const sources=[directory,...(fs.existsSync(marker)?[]:fs.readdirSync(root).filter(n=>/^\d+$/.test(n)).map(n=>path.join(root,n,accountKey(name))))];const newest=new Map();
 for(const folder of sources){if(!fs.existsSync(folder))continue;for(const file of fs.readdirSync(folder)){const type=file.match(/_([a-z0-9]+)-cache\.json$/)?.[1];if(!type)continue;const source=path.join(folder,file);try{const data=JSON.parse(fs.readFileSync(source,'utf8')),time=fs.statSync(source).mtimeMs;if(Object.keys(data).length&&(!newest.has(type)||newest.get(type).time<time))newest.set(type,{data,time});}catch{}}}
 for(const [type,{data,time}]of newest){const destination=path.join(directory,hash+'_'+type+'-cache.json');if(!fs.existsSync(destination)||fs.statSync(destination).mtimeMs<time){fs.writeFileSync(destination,JSON.stringify(data),{mode:0o600});fs.utimesSync(destination,time/1000,time/1000);}}fs.writeFileSync(marker,JSON.stringify({version:1,at:Date.now()}),{mode:0o600});return directory;
}
function refreshSaved(directory){
 try{return [...new Set(fs.readdirSync(directory).map(n=>n.replace(/\.bak$/,'')))].filter(n=>/_(?:live|sisu)-cache\.json$/.test(n)).some(n=>{try{const v=new(require('./auth-cache').AtomicCache)(path.join(directory,n)).load();return typeof v.token?.refresh_token==='string'&&v.token.refresh_token.length>0;}catch{return false;}});}catch{return false;}
}
function storageInfo(dir,env=process.env){
 const actual=path.resolve(dir),mount=env.RAILWAY_VOLUME_MOUNT_PATH&&path.resolve(env.RAILWAY_VOLUME_MOUNT_PATH),railway=!!(env.RAILWAY_PROJECT_ID||env.RAILWAY_ENVIRONMENT_ID||env.RAILWAY_SERVICE_ID);
 let mounted=false;try{mounted=fs.readFileSync('/proc/self/mountinfo','utf8').split('\n').some(line=>{const p=line.split(' ')[4]?.replace(/\\040/g,' ');return p&&p!=='/'&&(actual===p||actual.startsWith(p+'/'))&&(mount?p===mount:p===actual);});}catch{}
 return {path:actual,persistent:railway?!!mounted:null,message:railway?(mounted?'再起動後も使う認証はVolume内へ保存します':`再起動後の認証保存は未確認です。今の接続とは別の注意です。Railway VolumeのMount Pathを ${actual} にしてください。`):'このPCのDATA_DIRに認証を保存'};
}
class Accounts{
 constructor(store,options={}){this.store=store;this.jobs=new Map();this.flows=new Map();this.migrated=new Set();this.Flow=options.Flow;this.onChange=options.onChange||(()=>{});this.run=options.run||require('./auth-network').run;this.verifyAccount=options.verifyAccount||require('./bedrock-auth').verifyAccount;}
 username(name){return authUsername(name);}
 directory(id,name){const key=accountKey(name);if(!this.migrated.has(key)){migrate(this.store,name);this.migrated.add(key);}return authDirectory(this.store,id,name);}
 record(id,name,profile){if(!profile?.name||norm(profile.name)!==norm(name)){const dir=this.directory(id,name);if(profile?.name&&fs.existsSync(dir)){fs.renameSync(dir,dir+'.wrong-'+Date.now());this.flows.delete(id);}throw Error(`認証したアカウントが違います: ${profile?.name||'不明'} / 設定: ${name}`);}const s=this.store.bot(id);s.authAccounts??={};s.authAccounts[accountKey(name)]={name:profile.name,verifiedAt:Date.now()};this.store.save();}
 snapshot(id,name){const job=this.jobs.get(id),same=job?.name===norm(name),record=this.store.bot(id).authAccounts?.[accountKey(name)],saved=refreshSaved(this.directory(id,name));
  return {phase:same?job.phase||null:null,state:same?(job.state==='waiting'&&(job.code?.expires??job.browser?.expires)<=Date.now()?'expired':job.state):saved?'saved':'required',saved,profile:record?.name||null,verifiedAt:record?.verifiedAt||null,code:same&&job.code&&job.code.expires>Date.now()?{value:job.code.user_code,url:require('./device-code-poll').verificationUrl(job.code.user_code),expires:job.code.expires}:null,browser:same&&job.state==='waiting'?job.browser?.snapshot()||null:null,error:same?job.error||null:null,approval:same?{polls:job.polls||0,lastPollAt:job.lastPollAt||null,acceptedAt:job.acceptedAt||null}:null,storage:storageInfo(this.store.dir)};
 }
 flow(id,name){const record=this.flows.get(id);return record?.name===norm(name)?record.flow:undefined;}
 reset(id,name){this.cancel(id);const directory=this.directory(id,name);if(fs.existsSync(directory)&&fs.readdirSync(directory).length)fs.renameSync(directory,directory+'.backup-'+Date.now()+'-'+crypto.randomUUID());fs.mkdirSync(directory,{recursive:true,mode:0o700});this.migrated.add(accountKey(name));this.onChange(id,'このアカウントの古い保存認証を退避しました。他のアカウントには影響しません');return this.snapshot(id,name);}
 start(id,name,options={}){
  const previous=this.jobs.get(id);if(previous&&previous.name===norm(name)&&(previous.state==='checking'||previous.state==='waiting'&&(previous.code?.expires??previous.browser?.expires)>Date.now()))return this.snapshot(id,name);
  this.cancel(id);const directory=this.directory(id,name);fs.mkdirSync(directory,{recursive:true,mode:0o700});
  const controller=new AbortController(),job={name:norm(name),state:'checking',controller};this.jobs.set(id,job);
  const current=()=>this.jobs.get(id)===job&&!controller.signal.aborted;
  const {Authflow}=require('prismarine-auth'),Flow=this.Flow||Authflow;
  let flow;
  const arm=ms=>{clearTimeout(job.timer);job.timer=setTimeout(()=>{if(!current())return;const waiting=job.state==='waiting',browser=!!job.browser;job.state='failed';job.error=waiting?(browser?'Microsoft browser sign-in expired. Open Email code sign-in again.':'Microsoft approval: expired_token. This bot did not receive approval for its current code. Start Fresh Microsoft login.'):(job.phase||'Microsoft/Xbox sign-in')+': timed out before account verification completed';job.phase=waiting?(browser?'Microsoft browser sign-in expired':'Microsoft approval expired'):job.phase;job.code=null;this.flows.delete(id);controller.abort();if(flow?.msa)flow.msa.polling=false;this.onChange(id,job.error);},ms);job.timer.unref?.();};arm(900000);
  try{flow=new Flow(authUsername(name),this.Flow?directory:require('./auth-cache').factory(directory),require('./auth-cache').options(),code=>{if(!current())return;job.code={...code,expires:Date.now()+(code.expires_in||900)*1000};job.state='waiting';job.phase='Waiting for Microsoft approval';arm((code.expires_in||900)*1000+1000);this.onChange(id,'Waiting for Microsoft approval of this bot code.');});}catch(error){clearTimeout(job.timer);job.state='failed';job.error=error.message;controller.abort();return this.snapshot(id,name);}
  require('./device-code-poll').install(flow,{signal:controller.signal,notify:text=>{if(current())this.onChange(id,text);},onState:(state,data={})=>{if(!current())return;if(state==='pending'){job.polls=data.polls;job.lastPollAt=data.at;job.phase='Waiting for Microsoft approval';}else if(state==='requesting')job.phase='Requesting Microsoft sign-in code';else if(state==='refreshing')job.phase='Refreshing saved Microsoft sign-in';else if(state==='renewing')job.phase='Saved sign-in expired; requesting a new code';},onAccepted:()=>{if(!current())return;job.state='checking';job.code=null;job.acceptedAt=Date.now();job.phase='Microsoft approved; validating Xbox profile';arm(900000);this.onChange(id,job.phase);}});
  if(options.method==='browser'){
   const verify=flow.msa.verifyTokens.bind(flow.msa),deviceAuth=flow.msa.authDeviceCode.bind(flow.msa);
   job.browser=new(require('./microsoft-browser').BrowserSignIn)(flow.msa,{signal:controller.signal,onAccepted:()=>{flow.msa.verifyTokens=verify;flow.msa.authDeviceCode=deviceAuth;if(current()){job.state='checking';job.acceptedAt=Date.now();job.phase='Microsoft approved; validating Xbox profile';arm(900000);}}});
   flow.msa.verifyTokens=()=>job.browser.status==='waiting'||job.browser.status==='exchanging'?Promise.resolve(false):verify();
   flow.msa.authDeviceCode=()=>job.browser.promise;job.state='waiting';job.phase='Complete Microsoft sign-in in the browser window';arm(601000);
  }
  this.flows.set(id,{name:norm(name),flow});job.flow=flow;
  const scope={signal:controller.signal,closed:()=>!current(),notify:text=>this.onChange(id,text),onStage:phase=>{if(current()&&job.state!=='waiting'){job.phase=phase;this.onChange(id,phase);}}};
  job.scope=scope;
  job.promise=this.run(scope,async()=>{
   const profile=await this.verifyAccount(flow,scope);if(!current())return;
   for(const file of fs.readdirSync(directory))if(file.endsWith('-cache.json'))fs.chmodSync(path.join(directory,file),0o600);
   const persistentSignIn=refreshSaved(directory);
   this.record(id,name,profile);
   job.state='ready';job.code=null;job.phase=persistentSignIn?'Xbox profile verified; Minecraft connection pending':'Xbox verified for this session; sign-in may be needed again';this.onChange(id,persistentSignIn?'Xbox sign-in saved. Connecting to Minecraft is a separate step.':'Xbox sign-in approved for this session. Microsoft did not issue a refresh token; sign-in may be needed again.');
  }).catch(error=>{if(!current())return;job.state='failed';job.code=null;job.error=require('./auth-diagnostics').message(error)||require('./auth-network').details(error)||error.message;this.flows.delete(id);this.onChange(id,'認証失敗: '+job.error);}).finally(()=>clearTimeout(job.timer));
  return this.snapshot(id,name);
 }
 completeBrowser(id,name,returnURL){const job=this.jobs.get(id);if(job?.name!==norm(name)||!job.browser)throw Object.assign(Error('No Microsoft browser sign-in is active for this account'),{status:409});return this.run(job.scope,()=>job.browser.complete(returnURL));}
 cancelBrowser(id,name,state){const job=this.jobs.get(id);if(job?.name!==norm(name)||job.browser?.id!==state)throw Object.assign(Error('Microsoft browser sign-in state did not match'),{status:403});job.browser.cancel();return {cancelled:true};}
 cancel(id){const job=this.jobs.get(id);if(job){clearTimeout(job.timer);job.controller.abort();if(job.flow?.msa)job.flow.msa.polling=false;}this.jobs.delete(id);this.flows.delete(id);}
 destroy(){for(const id of this.jobs.keys())this.cancel(id);}
}
module.exports={accountKey,Accounts,authDirectory,authUsername,refreshSaved,storageInfo,migrate,bedrockProfile};
