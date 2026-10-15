'use strict';
const aliases=['coord','pos','position'];
function coordinates(manager,target='1'){
 return manager.targets(String(target)).map(id=>{
  const b=manager.workers.get(id)?.bot,p=b?.entity?.position;
  if(!b?.connected)return `Bot${id}: 未接続`;
  if(!p||![p.x,p.y,p.z].every(Number.isFinite))return `Bot${id}: 座標未取得`;
  const dimension=({0:'現世',1:'ネザー',2:'エンド'})[b.dimensionId]??`dimension=${b.dimensionId??'不明'}`;
  return `Bot${id} ${b.username} | ${dimension} | X:${Math.floor(p.x)} Y:${Math.floor(p.y)} Z:${Math.floor(p.z)}${b.dead?'（死亡中・最終座標）':''}`;
 }).join('\n');
}
function compact(manager,ids){return ids.map(id=>{const b=manager.workers.get(id)?.bot,p=b?.entity?.position,dim=['現','ネ','終'][b?.dimensionId]||'?';return !b?.connected?`Bot${id}:OFF`:`Bot${id}:${Math.floor(p.x)},${Math.floor(p.y)},${Math.floor(p.z)}(${dim}${b.dead?' 死亡中':''})`;}).join(' | ');}
function chunks(manager,ids){const groups=[];let group=[];for(const id of ids){if(group.length&&compact(manager,[...group,id]).length>210){groups.push(group);group=[];}group.push(id);}if(group.length)groups.push(group);return groups;}
async function discordCoordinates(i,manager){
 if(!aliases.includes(i.commandName))return false;
 let content;try{content=coordinates(manager,i.options.getString('target')||'1');}catch(e){content=e.message;}
 await i.reply({content:content.slice(0,1900),flags:64,allowedMentions:{parse:[]}});return true;
}
function gameCoordinates(manager,id,packet){
 const input=require('./chat-input');let text=input.textOf(packet);if(!text.startsWith('!'))text=input.publicChat(packet)?.message||'';
 const match=text.match(/^!(coord|pos|position)(?:\s+(\d+|all))?$/iu);if(!match)return false;
 const bot=manager.workers.get(id)?.bot;if(!bot?.connected)return true;
 const realm=b=>`${b.config?.host}:${b.config?.port}`;
 const peers=[...manager.workers.entries()].filter(([,w])=>w.bot.connected&&realm(w.bot)===realm(bot)).map(([n])=>n).sort((a,b)=>a-b);
 // Elect the first observer; don't require one particular account to receive the chat.
 const output=manager.workers.get(peers[0])?.bot||bot;
 if(Date.now()-(manager.lastCoordinateReply?.get(realm(bot))||0)<1000)return true;
 manager.lastCoordinateReply??=new Map();manager.lastCoordinateReply.set(realm(bot),Date.now());
 const target=match[2]?.toLowerCase()||String(id);
 try{const ids=target==='all'?peers:manager.targets(target);if(ids.some(n=>!peers.includes(n)))throw Error('このサーバーに接続中のBot番号を指定してください');if(target==='all'){for(const group of chunks(manager,ids))output.chat(compact(manager,group),false,{priority:true,dedupeMs:5000,key:'coord:all:'+group.join(','),replace:true,render:()=>compact(manager,group)});}else output.chat(coordinates(manager,target),false,{priority:true,dedupeMs:5000,key:'coord:'+target,replace:true,render:()=>coordinates(manager,target)});}catch(e){output.chat(e.message);}
 return true;
}
module.exports={aliases,coordinates,discordCoordinates,gameCoordinates};
