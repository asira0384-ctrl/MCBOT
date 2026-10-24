'use strict';
const {norm,integer}=require('./util');
const LIMIT=20;
function validateName(value){const name=String(value||'').trim();if(!name||name.length>64||/[\x00-\x1f]/u.test(name))throw Error('正確なゲーマータグを1〜64文字で指定してください');return name;}
function load(store,env=process.env){
 let entries;
 if(Array.isArray(store.data.accountSlots))entries=store.data.accountSlots.map(row=>[integer(row.id,1,LIMIT),validateName(store.bot(row.id).accountName||row.name)]);
 else{
  const existing=new Map();for(const [key,state]of Object.entries(store.data.bots||{})){const id=Number(key);if(!Number.isInteger(id)||id<1||id>LIMIT)continue;const verified=Object.values(state.authAccounts||{}).filter(v=>v?.name).sort((a,b)=>(b.verifiedAt||0)-(a.verifiedAt||0))[0];const saved=state.accountName||verified?.name;if(saved)existing.set(id,validateName(saved));}
  const names=String(env.BOT_NAMES||'').split(',').map(s=>s.trim()).filter(Boolean).map(validateName),ign=String(env.IGN_BOT_NAME||'').trim();
  if(names.length+(ign?1:0)>LIMIT)throw Error('全体で最大20アカウントです。IGNを別枠にする場合BOT_NAMESは19個まで');
  for(const [index,name]of names.entries()){const id=ign&&index>=10?index+2:index+1;if(!existing.has(id))existing.set(id,validateName(store.bot(id).accountName||name));if(!ign&&id===11)store.bot(id).serverRealm??='2b2e';}
  if(ign&&!existing.has(11))existing.set(11,validateName(store.bot(11).accountName||ign));entries=[...existing];
 }
 if(entries.length>LIMIT||new Set(entries.map(([id])=>id)).size!==entries.length||new Set(entries.map(([,name])=>norm(name))).size!==entries.length)throw Error('アカウント番号・ゲーマータグが重複しています');
 const result=new Map(entries.sort((a,b)=>a[0]-b[0]));if(!Array.isArray(store.data.accountSlots)){store.data.accountSlots=[...result].map(([id,name])=>({id,name}));store.save();}return result;
}

function save(manager){manager.store.data.accountSlots=[...manager.names].map(([id,name])=>({id,name}));manager.store.save();manager.changed?.(0,'accounts');}
function add(manager,value,realm='2b2e'){
 const name=validateName(value);if(!['ign','2b2e'].includes(realm))throw Error('接続先を選択してください');if(manager.names.size>=LIMIT)throw Error('最大20アカウントです');if([...manager.names.values()].some(n=>norm(n)===norm(name)))throw Error('同じアカウントは重複登録できません');
 let id=1;while(manager.names.has(id))id++;const state=manager.store.bot(id);state.accountName=name;state.serverRealm=realm;state.runtimePaused=true;manager.names.set(id,name);manager.names=new Map([...manager.names].sort((a,b)=>a[0]-b[0]));save(manager);return {id,name,realm};
}
module.exports={LIMIT,load,save,add,validateName};
