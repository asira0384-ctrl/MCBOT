'use strict';
const {OWNER}=require('./store');
const valid=id=>/^[1-9]\d{16,19}$/u.test(String(id));
function operator(store,id,owner=OWNER){return String(id)===owner||(store.data.discordAdmins||[]).some(row=>row.id===String(id));}
function update(store,actor,action,user,owner=OWNER){
 if(String(actor)!==owner)throw Error('Discord管理者を登録・解除できるのはAsira本人だけです');store.data.discordAdmins??=[];
 if(action==='list')return store.data.discordAdmins.map(row=>({...row}));
 if(!valid(user?.id))throw Error('Discordユーザーを指定してください');if(String(user.id)===owner)throw Error('Asira本人の権限は常に有効です');if(!['add','remove'].includes(action))throw Error('管理者の操作が不正です');
 store.data.discordAdmins=store.data.discordAdmins.filter(row=>row.id!==String(user.id));if(action==='add')store.data.discordAdmins.push({id:String(user.id),name:String(user.globalName||user.username||user.id).slice(0,80),at:Date.now()});
 store.save();return store.data.discordAdmins;
}
module.exports={operator,update};
