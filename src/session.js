'use strict';
// Responses to server-driven transitions. Never invent a destination or walk
// the player while acknowledging a loading screen / teleport.
function action(bot,name){
 const p=bot.entity?.position;if(!p||bot.ended)return false;
 const mappings=bot.registry?.protocol.types.Action?.[1]?.mappings;
 if(!mappings||!Object.values(mappings).includes(name))return false;
 const position={x:Math.floor(p.x),y:Math.floor(p.y),z:Math.floor(p.z)};
 bot.client.queue('player_action',{runtime_entity_id:BigInt(bot._runtimeEntityId),action:name,position,result_position:position,face:0});
 bot.sessionResponses[name]=(bot.sessionResponses[name]||0)+1;return true;
}
function installSession(bot){
 bot.sessionResponses={};bot.worldGeneration=0;bot.initialDataAcknowledged=false;
 bot.client.on('move_player',p=>{
  const teleport=p.mode==='teleport'||p.mode===2;
  if(teleport&&String(p.runtime_id)===String(bot._runtimeEntityId)&&p.position){
   // Physics listener has already applied the authoritative position.
   action(bot,'handled_teleport');
  }
 });
 bot.on('terrainDecoded',()=>{
  if(!bot.connected||!bot.terrainReady||bot.initialDataAcknowledged||bot.ended)return;
  if(bot.pendingDimensionAck){action(bot,'dimension_change_ack');bot.pendingDimensionAck=false;}
  action(bot,'received_server_data');bot.pendingServerData=true;bot.initialDataAcknowledged=true;
  bot.connectionPhase='接続済み・本ワールド到着は未確認';
  bot.emit('diagnostic',`初期地形の受信を通知: dimension=${bot.dimensionId}`);
 });
 bot.on('spawn',()=>{if(bot.terrainReady)bot.emit('terrainDecoded');});
 bot.client.on('change_dimension',p=>{
  if(!bot.entity||bot.ended)return;
  bot.halt();bot.worldGeneration++;bot.initialDataAcknowledged=false;bot.terrainReady=false;bot.pendingDimensionAck=true;
  bot.dimensionId=typeof p.dimension==='number'?p.dimension:({overworld:0,nether:1,end:2,the_nether:1,the_end:2}[p.dimension]??0);
  bot.worldMirror.reset();
  if(p.position){bot.serverPosition={...p.position};bot.entity.position.x=p.position.x;bot.entity.position.y=p.position.y-1.62;bot.entity.position.z=p.position.z;bot._lastSentPos=bot.entity.position.clone();bot.position=bot.entity.position;}
  bot.entity.velocity.x=bot.entity.velocity.y=bot.entity.velocity.z=0;
  bot.connectionPhase='ディメンション切替・地形受信待ち';
  bot.client.queue('request_chunk_radius',{chunk_radius:4,max_radius:4});
  bot.emit('diagnostic',`ディメンション切替: ${bot.dimensionId}。採掘を停止して新しい地形を待ちます`);
  bot.emit('dimensionChanged');
 });
}
module.exports={installSession,action};
