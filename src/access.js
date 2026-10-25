'use strict';
const {OWNER}=require('./store');
const valid=id=>/^[1-9]\d{16,19}$/u.test(String(id));
function rows(store){const byId=new Map();for(const row of [...(store.data.webAccess||[]),...(store.data.discordAdmins||[])]){const id=String(row?.id||'');if(valid(id))byId.set(id,{...row,id});}return [...byId.values()];}
function operator(store,id,owner=OWNER){return String(id)===String(owner)||rows(store).some(row=>row.id===String(id));}
function update(store,actor,action,user,owner=OWNER){
 if(String(actor)!==String(owner))throw Error('Discord管理者を登録・解除できるのはAsira本人だけです');
 if(action==='list')return rows(store);
 if(!valid(user?.id))throw Error('Discordユーザーを指定してください');if(String(user.id)===owner)throw Error('Asira本人の権限は常に有効です');if(!['add','remove'].includes(action))throw Error('管理者の操作が不正です');
 const before={discordAdmins:store.data.discordAdmins,webAccess:store.data.webAccess},next=rows(store).filter(row=>row.id!==String(user.id));if(action==='add')next.push({id:String(user.id),name:String(user.globalName||user.username||user.id).slice(0,80),username:String(user.username||user.id).slice(0,80),avatar:/^(?:a_)?[a-f0-9]{32}$/u.test(user.avatar||'')?user.avatar:null,at:Date.now()});
 store.data.discordAdmins=next;store.data.webAccess=next.map(row=>({...row}));try{store.save();}catch(e){Object.assign(store.data,before);throw e;}return next;
}
module.exports={operator,update,rows};
