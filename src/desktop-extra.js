'use strict';
const fail=m=>Object.assign(Error(m),{status:400});
function endpoint(d){const host=String(d.host||'').trim(),port=Number(d.port);if(!host||host.length>253||!(/^(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(host)||require('node:net').isIP(host))||!Number.isInteger(port)||port<1||port>65535)throw fail('IP/ホスト名とport（1〜65535）を確認してください');return {host,port};}
async function apply(web,s,d){const m=web.manager,ids=()=>web.targets(d.target);switch(d.action){
case 'relation':{if(!['friend','enemy'].includes(d.kind)||!['add','remove'].includes(d.operation))throw fail('リスト操作を選択してください');const name=require('./chat-output').name(d.name);return {result:await m.execute(String(m.names.keys().next().value),d.kind+' '+d.operation+' '+name,'web')};}
case 'queue-clear':{let count=0;for(const id of ids())count+=m.workers.get(id)?.bot.chatQueue?.clear()||0;return {ok:true,result:'Cleared '+count+' queued messages'};}
case 'instant':{if(!['kit','world','back'].includes(d.kind))throw fail('操作を選択してください');let value=String(d.value||'').trim();if(value.length>80||/[\x00-\x1f]/.test(value))throw fail('入力を確認してください');return await web.command({target:d.target,command:d.kind+(value?' '+value:'')});}

case 'players':return {players:[...new Set([...m.workers.values()].flatMap(w=>[...(w.bot.players?.values()||[])].map(p=>p.name)))].sort()};
case 'add':return {account:require('./account-slots').add(m,d.name,d.realm)};
case 'rename':{const list=ids();if(list.length!==1)throw fail('Botを1体選択してください');return {result:await m.execute(String(list[0]),'account set '+require('./account-slots').validateName(d.name),'web')};}
case 'remove':{web.requireOwner(s);const list=ids();if(list.length!==1||d.confirm!==true)throw fail('削除するBotを1体選び、確認してください');const id=list[0];await m.execute(String(id),'disconnect','web');m.names.delete(id);delete m.store.data.bots[id];require('./account-slots').save(m);return {result:'アカウント枠を削除しました（認証キャッシュのファイルは削除していません）'};}
case 'endpoint':{if(!['ign','2b2e'].includes(d.realm))throw fail('サーバーを選択してください');const dest=d.custom?endpoint(d):null;for(const id of ids()){await m.execute(String(id),'disconnect','web');const state=m.store.bot(id);state.serverRealm=d.realm;if(dest)state.customEndpoint=dest;else delete state.customEndpoint;}m.store.save();return {result:'接続先を保存しました。Connectで接続してください'};}
case 'tpa':{if(!['request','accept','deny'].includes(d.kind))throw fail('TPA操作を選択してください');const who=require('./chat-output').name(d.player),line=(d.kind==='request'?'/tpa ':d.kind==='accept'?'/tpaccept ':'/tpdeny ')+JSON.stringify(who);const results=[];for(const id of ids())try{require('./fleet-teleport').send(m.worker(id).bot,line);results.push({id,ok:true,result:line});}catch(e){results.push({id,ok:false,result:e.message});}return {ok:results.every(r=>r.ok),results,result:results.map(r=>'Bot'+r.id+': '+r.result).join('\n')};}
default:throw fail('操作を確認してください');
}}
module.exports={apply,endpoint};
