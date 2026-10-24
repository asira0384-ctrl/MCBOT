'use strict';
const {norm,integer}=require('./util');
const LIMIT=20;
function validateName(value){const name=String(value||'').trim();if(!name||name.length>64||/[\x00-\x1f]/u.test(name))throw Error('正確なゲーマータグを1〜64文字で指定してください');return name;}
function load(store,env=process.env){
 let entries;
 if(Array.isArray(store.data.accountSlots))entries=store.data.accountSlots.map(row=>[integer(row.id,1,LIMIT),validateName(store.bot(row.id).accountName||row.name)]);
 else{
  const names=(env.BOT_NAMES||Array.from({length:10},(_,i)=>`Aslrq${String(i+1).padStart(2,'0')}x`).join(',')).split(',').map(s=>s.trim()).filter(Boolean).map(validateName);
  const ign=env.IGN_BOT_NAME===undefined?'Aslrq00x':env.IGN_BOT_NAME.trim();
  if(!names.length||names.length+(ign?1:0)>LIMIT)throw Error('全体で最大20アカウントです。IGNを別枠にする場合BOT_NAMESは19個まで');
  entries=names.map((name,i)=>{const id=ign&&i>=10?i+2:i+1;return [id,validateName(store.bot(id).accountName||name)];});
  if(ign)entries.push([11,validateName(store.bot(11).accountName||ign)]);else if(entries.some(([id])=>id===11))store.bot(11).serverRealm??='2b2e';
 }
 if(!entries.length||entries.length>LIMIT||new Set(entries.map(([id])=>id)).size!==entries.length||new Set(entries.map(([,name])=>norm(name))).size!==entries.length)throw Error('アカウント番号・ゲーマータグが重複しています');
 return new Map(entries.sort((a,b)=>a[0]-b[0]));
}
function save(manager){manager.store.data.accountSlots=[...manager.names].map(([id,name])=>({id,name}));manager.store.save();manager.changed?.(0,'accounts');}
function add(manager,value,realm='2b2e'){
 const name=validateName(value);if(!['ign','2b2e'].includes(realm))throw Error('接続先を選択してください');if(manager.names.size>=LIMIT)throw Error('最大20アカウントです');if([...manager.names.values()].some(n=>norm(n)===norm(name)))throw Error('同じアカウントは重複登録できません');
 let id=1;while(manager.names.has(id))id++;const state=manager.store.bot(id);state.accountName=name;state.serverRealm=realm;state.runtimePaused=true;manager.names.set(id,name);manager.names=new Map([...manager.names].sort((a,b)=>a[0]-b[0]));save(manager);return {id,name,realm};
}
module.exports={LIMIT,load,save,add,validateName};
