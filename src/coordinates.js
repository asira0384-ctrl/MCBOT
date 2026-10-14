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
async function discordCoordinates(i,manager){
 if(!aliases.includes(i.commandName))return false;
 let content;try{content=coordinates(manager,i.options.getString('target')||'1');}catch(e){content=e.message;}
 await i.reply({content:content.slice(0,1900),flags:64,allowedMentions:{parse:[]}});return true;
}
function gameCoordinates(manager,id,packet){
 let text=String(packet.message||'').replace(/§./gu,'').replace(/[\u200B-\u200D\uFEFF]/gu,'').normalize('NFKC').trim();
 if(packet.type==='translation'&&Array.isArray(packet.parameters)){
  const values=packet.parameters.map(v=>String(v).replace(/§./gu,'').normalize('NFKC').trim());
  if(values.length===2&&/^!/.test(values[1]))text=values[1];
 }
 if(!text.startsWith('!')){const wrapped=text.match(/^[^\r\n]+?\s*[»›❯➤>]\s*(![^\r\n]+)$/u);if(!wrapped)return false;text=wrapped[1];}
 const match=text.match(/^!(coord|pos|position)(?:\s+(\d+|all))?$/iu);if(!match)return false;
 const bot=manager.workers.get(id)?.bot;if(!bot?.connected)return true;
 const realm=b=>`${b.config?.host}:${b.config?.port}`;
 const peers=[...manager.workers.entries()].filter(([,w])=>w.bot.connected&&realm(w.bot)===realm(bot)).map(([n])=>n).sort((a,b)=>a-b);
 // One reply per server, even when all fleet accounts receive the same chat.
 if(id!==peers[0])return true;
 if(Date.now()-(manager.lastCoordinateReply?.get(realm(bot))||0)<1000)return true;
 manager.lastCoordinateReply??=new Map();manager.lastCoordinateReply.set(realm(bot),Date.now());
 const target=match[2]?.toLowerCase()||String(id);
 try{const ids=target==='all'?peers:manager.targets(target);if(ids.some(n=>!peers.includes(n)))throw Error('このサーバーに接続中のBot番号を指定してください');for(const n of ids)bot.chat(coordinates(manager,String(n)));}catch(e){bot.chat(e.message);}
 return true;
}
module.exports={aliases,coordinates,discordCoordinates,gameCoordinates};
