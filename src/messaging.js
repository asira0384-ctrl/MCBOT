'use strict';
const {name,message}=require('./chat-output');
function lines(value){return Array.isArray(value)?value.map(String):String(value||'').split(/\r?\n/u).map(s=>s.trim()).filter(Boolean);}
function targets(value){const rows=Array.isArray(value)?value:String(value||'').split(/[,、\r\n]+/u);const result=[...new Set(rows.map(s=>String(s).trim()).filter(Boolean).map(name))];if(result.length>20)throw Error('対象プレイヤーは20人までです');return result;}
function messages(value){const rows=lines(value).map(message);if(rows.length>50)throw Error('メッセージは50種類までです');return [...new Set(rows)];}
function config(manager,id,section,bot){const saved=manager.store?.bot?.(id)?.[section];if(saved)return saved;if(section==='greeting'){const raw=(bot?.config?.greetTarget??(manager.realm?.(id)==='ign'?process.env.IGN_GREET_TARGET_ID||process.env.GREET_TARGET_ID:process.env.GREET_TARGET_ID))||'';return {enabled:!!raw,targets:targets(raw),join:[],leave:[],chat:[]};}return section==='replies'?{enabled:false,targets:[],messages:[]}:{enabled:false,messages:[],intervalSeconds:300};}
function configure(manager,ids,section,value){
 if(!['greeting','replies','announcement'].includes(section)||typeof value.enabled!=='boolean')throw Error('通知設定が不正です');const next={enabled:value.enabled};
 if(section!=='announcement'){next.targets=targets(value.targets);if(next.enabled&&!next.targets.length)throw Error('対象のIDを入力してください');}
 if(section==='greeting'){for(const key of ['join','leave','chat'])next[key]=messages(value[key]);}
 else{next.messages=messages(value.messages);if(next.enabled&&!next.messages.length)throw Error('メッセージを1種類以上入力してください');}
 if(section==='announcement'){const seconds=Number(value.intervalSeconds??300);if(!Number.isInteger(seconds)||seconds<300||seconds>86400)throw Error('定期案内の間隔は300〜86400秒です');next.intervalSeconds=seconds;next.nextAt=Date.now()+seconds*1000;}
 for(const id of ids)manager.store.bot(id)[section]=structuredClone(next);manager.store.save();for(const id of ids)manager.changed?.(id,'messaging');return next;
}
function snapshot(manager,id,bot){return Object.fromEntries(['greeting','replies','announcement'].map(s=>[s,config(manager,id,s,bot)]));}
module.exports={targets,messages,config,configure,snapshot};
