'use strict';
const {Vec3}=require('vec3');const {norm}=require('./util');
function normalizePlayer(bot,a,raw,kind=a.positionKind||'move_entity'){
 if(!a.player)return a.position;
 a.positionContext??={actorPositionContext:true};a.positionContext.blockAt=p=>bot.blockAt(p);
 a.positionKind=kind;a.rawPosition={x:raw.x,y:raw.y,z:raw.z};
 // Nukkit AddPlayer/MoveActorAbsolute use feet; MovePlayer uses the eye.
 // Remember each transport's frame on this actor, including across deltas.
 a.position=require('./positions').serverPosition(a.positionContext,a.rawPosition,kind,kind==='move_player'?'eye':'feet');
 a.positionFrame=a.positionContext.lastPositionNormalization.frame;a.normalizedRaw=a.rawPosition;a.normalizedRevision=bot.worldMirror?.revision;return a.position;
}
function refreshPlayer(bot,a){if(a.player&&a.rawPosition&&(a.normalizedRaw!==a.rawPosition||a.normalizedRevision!==bot.worldMirror?.revision))normalizePlayer(bot,a,a.rawPosition);return a.position;}
function trackActors(bot){
 bot.actors=new Map();
 const metadata=(a,list=[])=>{const flags=list.find(m=>m.key===0||m.key==='flags');if(flags){try{a.sneaking=!!(BigInt(flags.value)&2n);a.flagsKnown=true;}catch{}}};
 const add=(p,player)=>{if(String(p.runtime_id)===String(bot._runtimeEntityId)||!p.position)return;const a={id:BigInt(p.runtime_id),uniqueId:String(p.unique_id??p.runtime_id),uuid:p.uuid,name:p.username||p.entity_type||'',player,position:new Vec3(p.position.x,p.position.y,p.position.z),rawPosition:null,mainhand:player?(p.held_item||p.item||null):null,armor:null,offhand:null,seen:Date.now(),dimension:bot.dimensionId};if(player)normalizePlayer(bot,a,p.position,'add_player');bot.actors.set(String(p.runtime_id),a);metadata(a,p.metadata);bot.emit('actorAdded',a);};
 bot.client.on('add_player',p=>add(p,true));bot.client.on('add_entity',p=>add(p,false));
 bot.client.on('mob_equipment',p=>{const a=bot.actors.get(String(p.runtime_entity_id));if(!a)return;if(p.window_id==='offhand'||p.window_id===119)a.offhand=p.item?.network_id?p.item:null;else a.mainhand=p.item?.network_id?p.item:null;a.equipmentAt=Date.now();});
 bot.client.on('mob_armor_equipment',p=>{const a=bot.actors.get(String(p.runtime_entity_id));if(a){a.armor=[p.helmet,p.chestplate,p.leggings,p.boots].map(i=>i?.network_id?i:null);a.equipmentAt=Date.now();}});
 bot.client.on('set_entity_data',p=>{const a=bot.actors.get(String(p.runtime_entity_id));if(a)metadata(a,p.metadata);if(String(p.runtime_entity_id)===String(bot._runtimeEntityId)&&bot.handUse?.firstUseAt){const flags=p.metadata?.find(m=>m.key===0||m.key==='flags');if(flags)try{const using=!!(BigInt(flags.value)&16n),state=bot.handUse;if(using)state.serverUsingAt??=Date.now();else if(state.serverUsingAt&&state.phase==='using')state.serverCancelledAt=Date.now();bot.emit('itemUseState',using);}catch{}}});
 bot.client.on('move_player',p=>{const a=bot.actors.get(String(p.runtime_id));if(a&&p.position){if(p.mode!=='rotation'&&p.mode!==3)normalizePlayer(bot,a,p.position,'move_player');a.seen=Date.now();bot.emit('actorUpdated',a);}});
 bot.client.on('move_entity',p=>{const a=bot.actors.get(String(p.runtime_entity_id));if(a&&p.position){if(a.player)normalizePlayer(bot,a,p.position,'move_entity');else a.position=new Vec3(p.position.x,p.position.y,p.position.z);a.seen=Date.now();bot.emit('actorUpdated',a);}});
 bot.client.on('move_entity_delta',p=>{const a=bot.actors.get(String(p.runtime_entity_id));if(a){const frame=a.positionContext?.positionFrames?.move_entity||'feet',raw=a.player?{x:a.position.x,y:a.position.y+(frame==='eye'?1.62:0),z:a.position.z}:{...a.position};for(const k of ['x','y','z'])if(p[k]!==undefined&&p[k]!==null)raw[k]=p[k];if(a.player)normalizePlayer(bot,a,raw,'move_entity');else a.position=new Vec3(raw.x,raw.y,raw.z);a.seen=Date.now();bot.emit('actorUpdated',a);}});
 bot.client.on('remove_entity',p=>{for(const [id,a] of bot.actors)if(a.uniqueId===String(p.entity_id_self)){bot.actors.delete(id);bot.emit('actorRemoved',a);}});
 bot.client.on('player_list',p=>{const payload=p.records;const list=Array.isArray(payload)?payload:payload?.records||[];for(const r of list)if((Array.isArray(payload)?r.type:payload.type)==='remove')for(const [id,a]of bot.actors)if(a.uuid===r.uuid)bot.actors.delete(id);});
 bot.client.on('entity_event',p=>{const own=String(p.runtime_entity_id)===String(bot._runtimeEntityId);if(own&&bot.handUse?.firstUseAt&&(p.event_id==='use_item'||p.event_id===9)){bot.handUse.serverConsumedAt=Date.now();bot.emit('itemConsumed');}if(own&&(p.event_id==='consume_totem'||p.event_id===65)){if(/totem/.test(bot.name(bot.offhand?.[0])))bot.offhand[0]=null;bot.emit('totemUsed');}
  if(p.event_id==='death_animation'||p.event_id===3){const actor=bot.actors.get(String(p.runtime_entity_id));if(actor)bot.emit('actorDied',actor);bot.actors.delete(String(p.runtime_entity_id));if(own&&!bot.dead)bot.markDead('entity_event');}
 });
 bot.on('dimensionChanged',()=>bot.actors.clear());bot.on('end',()=>bot.actors.clear());
}
function nearestEnemy(bot,enemies,range=12){if(!bot.entity)return null;for(const a of bot.actors?.values()||[])refreshPlayer(bot,a);return [...(bot.actors?.values()||[])].filter(a=>a.player&&a.dimension===bot.dimensionId&&a.id!==bot._runtimeEntityId&&enemies.some(e=>norm(e.name)===norm(a.name)&&(!e.xuid||bot.players.get(norm(a.name))?.xuid===e.xuid))&&a.position.distanceTo(bot.entity.position)<=range).sort((a,b)=>a.position.distanceTo(bot.entity.position)-b.position.distanceTo(bot.entity.position))[0]||null;}
function lineOfSight(bot,point){return require('./geometry').rayClear(bot,bot.entity.position.offset(0,1.62,0),point);}
module.exports={trackActors,nearestEnemy,lineOfSight,normalizePlayer,refreshPlayer};
