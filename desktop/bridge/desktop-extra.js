'use strict';
const fail=m=>Object.assign(Error(m),{status:400});
function endpoint(d){const host=String(d.host||'').trim(),port=Number(d.port);if(!host||host.length>253||!(/^(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(host)||require('node:net').isIP(host))||!Number.isInteger(port)||port<1||port>65535)throw fail('IP/ホスト名とport（1〜65535）を確認してください');return {host,port};}
function eventReport(manager,ids,field){
 const bots=ids.map(id=>({id,events:manager.store.bot(id)[field]||[]}));
 const recent=bots.flatMap(({id,events})=>events.map(e=>({...e,id}))).sort((a,b)=>new Date(b.at)-new Date(a.at)).slice(0,35);
 const rows=recent.map(e=>{
  const time=new Date(e.at).toISOString().replace('T',' ').slice(0,19)+' UTC';
  if(field==='killLog')return `Bot${e.id}  ${time}  ${e.kind} / ${e.actor||'相手不明'}${e.evidence==='recent PvP target (unconfirmed)'?' (交戦相手・攻撃者未確認)':''} / ${e.reason}`;
  return `Bot${e.id}  ${time} / ${e.reason} / ${e.detail||''} / ${e.result||''}`;
 });
 return {bots,rows};
}
async function apply(web,s,d){const m=web.manager,ids=()=>web.targets(d.target);switch(d.action){
case 'offlog':return require('./offlog').control(d);
case 'create-group':{
 const name=String(d.name||'').trim(),groups=m.store.data.botGroups??=[];
 if(!name||name.length>48||groups.some(g=>g.name===name))throw fail('グループ名を確認してください');
 if(!Array.isArray(d.members)||!d.members.length||d.members.some(id=>!m.names.has(id)))throw fail('登録済みのBotを選択してください');
 const group={id:'group-'+require('node:crypto').randomUUID(),name,members:[...new Set(d.members)]};
 groups.push(group);m.store.save();m.changed?.(0,'accounts');return {ok:true,group,result:'グループを作成しました'};
}
case 'kill-log':return {ok:true,report:eventReport(m,ids(),'killLog')};
case 'save-mining-team':case 'delete-mining-team':{
 const teams=m.store.data.miningTeams??=[];
 if(d.action==='delete-mining-team'){
  const index=teams.findIndex(t=>t.id===d.id);
  if(index>=0)teams.splice(index,1);
 }else{
  const members=Array.isArray(d.members)?[...new Set(d.members)]:[];
  if(!Number.isInteger(d.size)||d.size!==members.length||d.size<1||members.some(id=>!m.names.has(id)))throw fail('人数とBot番号を確認してください');
  if(teams.some(t=>t.members.some(id=>members.includes(id))))throw fail('他のチームに入っているBotがいます');
  teams.push({id:require('node:crypto').randomUUID(),members});
 }
 m.store.save();return {ok:true,teams,result:'採掘チームを更新しました'};
}
case 'recovery-log':return {ok:true,report:eventReport(m,ids(),'nukeRecoveryHistory')};
case 'nuke-log':return {ok:true,report:{generatedAt:new Date().toISOString(),bots:ids().map(id=>{
 const w=m.workers.get(id);
 return {id,connected:!!w?.bot.connected,phase:w?.miningPhase,log:w?.nukeLog||[]};
})}};
case 'debug-export':return {ok:true,report:require('../../src/diagnostics/debug-report').report(m,ids())};
case 'form-response':{const chosen=ids();if(chosen.length!==1)throw fail('Choose one bot form. Each form must be submitted manually.');return require('../../src/bedrock/server-forms').respond(m.workers.get(chosen[0])?.bot,d.token,d.response,d.cancel===true);}
case 'relation':{if(!['friend','enemy'].includes(d.kind)||!['add','remove'].includes(d.operation))throw fail('リスト操作を選択してください');const name=require('../../model/chat/delivery/chat-output').name(d.name);return {result:await m.execute(String(m.names.keys().next().value),d.kind+' '+d.operation+' '+name,'web')};}
case 'queue-clear':{let count=0;for(const id of ids())count+=m.workers.get(id)?.bot.chatQueue?.clear()||0;return {ok:true,result:'Cleared '+count+' queued messages'};}
case 'instant':{if(!['kit','world','back'].includes(d.kind))throw fail('操作を選択してください');let value=String(d.value||'').trim();if(value.length>80||/[\x00-\x1f]/.test(value))throw fail('入力を確認してください');return await web.command({target:d.target,command:d.kind+(value?' '+value:'')});}

case 'players':return {players:[...new Set([...m.workers.values()].flatMap(w=>[...(w.bot.players?.values()||[])].map(p=>p.name)))].sort()};
case 'add':return {account:require('../../src/auth/account-slots').add(m,d.name,d.realm)};
case 'rename':{const list=ids();if(list.length!==1)throw fail('Botを1体選択してください');return {result:await m.execute(String(list[0]),'account set '+require('../../src/auth/account-slots').validateName(d.name),'web')};}
case 'remove':{web.requireOwner(s);const list=ids();if(list.length!==1||d.confirm!==true)throw fail('削除するBotを1体選び、確認してください');const id=list[0];await m.execute(String(id),'disconnect','web');m.names.delete(id);for(const g of m.store.data.botGroups||[])g.members=g.members.filter(n=>n!==id);for(const t of m.store.data.miningTeams||[])t.members=t.members.filter(n=>n!==id);delete m.store.data.bots[id];require('../../src/auth/account-slots').save(m);return {result:'アカウント枠を削除しました（認証キャッシュのファイルは削除していません）'};}
case 'connect-route': {
 // One atomic desktop action: apply requested server FIRST, THEN start login/connect.
 // A saved Microsoft token is not a guarantee of Minecraft authorization.
 if(!['ign','2b2e'].includes(d.realm))throw fail('Server must be ign or 2b2e');
 const destination=d.custom?endpoint(d):null,chosen=ids(),results=[];
 for(const id of chosen){
  const state=m.store.bot(id),old=state.customEndpoint;
  const changed=state.serverRealm!==d.realm||!!old!==!!destination||
   !!destination&&(old?.host!==destination.host||Number(old?.port)!==destination.port);
  try{
   if(changed){await m.execute(String(id),'disconnect','web');state.serverRealm=d.realm;
    if(destination)state.customEndpoint=destination;else delete state.customEndpoint;
    m.store.save();m.changed?.(id,'server');}
   m.connectionKeeper?.retry(id);const status=m.requestConnection(id);results.push({id,ok:true,
    result:'Connecting '+d.realm.toUpperCase()+' / '+(status?.connection?.phase||'auth pending')});
  }catch(error){results.push({id,ok:false,result:error.message});}
 }
 return {ok:results.every(row=>row.ok),results,
  result:results.map(row=>'Bot'+row.id+': '+row.result).join('\n')};
}
case 'endpoint':{if(!['ign','2b2e'].includes(d.realm))throw fail('サーバーを選択してください');const dest=d.custom?endpoint(d):null;for(const id of ids()){await m.execute(String(id),'disconnect','web');const state=m.store.bot(id);state.serverRealm=d.realm;if(dest)state.customEndpoint=dest;else delete state.customEndpoint;}m.store.save();return {result:'接続先を保存しました。Connectで接続してください'};}
case 'tpa':{if(!['request','accept','deny'].includes(d.kind))throw fail('TPA操作を選択してください');const who=require('../../model/chat/delivery/chat-output').name(d.player),line=(d.kind==='request'?'/tpa ':d.kind==='accept'?'/tpaccept ':'/tpdeny ')+JSON.stringify(who);const results=[];for(const id of ids())try{require('../../model/server/actions/fleet-teleport').send(m.worker(id).bot,line);results.push({id,ok:true,result:line});}catch(e){results.push({id,ok:false,result:e.message});}return {ok:results.every(r=>r.ok),results,result:results.map(r=>'Bot'+r.id+': '+r.result).join('\n')};}
default:throw fail('操作を確認してください');
}}
module.exports={apply,endpoint};
