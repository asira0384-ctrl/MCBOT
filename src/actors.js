'use strict';
const {Vec3}=require('vec3');const {norm}=require('./util');
function trackActors(bot){
 bot.actors=new Map();
 const playerPosition=p=>require('./positions').serverPosition({blockAt:bot.blockAt},p,'actor');
 const metadata=(a,list=[])=>{const flags=list.find(m=>m.key===0||m.key==='flags');if(flags){try{a.sneaking=!!(BigInt(flags.value)&2n);a.flagsKnown=true;}catch{}}};
 const add=(p,player)=>{if(String(p.runtime_id)===String(bot._runtimeEntityId)||!p.position)return;const position=player?playerPosition(p.position):new Vec3(p.position.x,p.position.y,p.position.z);bot.actors.set(String(p.runtime_id),{id:BigInt(p.runtime_id),uniqueId:String(p.unique_id??p.runtime_id),uuid:p.uuid,name:p.username||p.entity_type||'',player,position,rawPosition:player?p.position:null,mainhand:player?(p.held_item||p.item||null):null,armor:null,offhand:null,seen:Date.now(),dimension:bot.dimensionId});metadata(bot.actors.get(String(p.runtime_id)),p.metadata);bot.emit('actorAdded',bot.actors.get(String(p.runtime_id)));};
 bot.client.on('add_player',p=>add(p,true));bot.client.on('add_entity',p=>add(p,false));
 bot.client.on('mob_equipment',p=>{const a=bot.actors.get(String(p.runtime_entity_id));if(!a)return;if(p.window_id==='offhand'||p.window_id===119)a.offhand=p.item?.network_id?p.item:null;else a.mainhand=p.item?.network_id?p.item:null;a.equipmentAt=Date.now();});
 bot.client.on('mob_armor_equipment',p=>{const a=bot.actors.get(String(p.runtime_entity_id));if(a){a.armor=[p.helmet,p.chestplate,p.leggings,p.boots].map(i=>i?.network_id?i:null);a.equipmentAt=Date.now();}});
 bot.client.on('set_entity_data',p=>{const a=bot.actors.get(String(p.runtime_entity_id));if(a)metadata(a,p.metadata);});
 bot.client.on('move_player',p=>{const a=bot.actors.get(String(p.runtime_id));if(a&&p.position){a.rawPosition=p.position;a.position=playerPosition(p.position);a.seen=Date.now();bot.emit('actorUpdated',a);}});
 bot.client.on('move_entity',p=>{const a=bot.actors.get(String(p.runtime_entity_id));if(a&&p.position){a.rawPosition=null;a.position=new Vec3(p.position.x,p.position.y,p.position.z);a.seen=Date.now();bot.emit('actorUpdated',a);}});
 bot.client.on('move_entity_delta',p=>{const a=bot.actors.get(String(p.runtime_entity_id));if(a){for(const k of ['x','y','z'])if(p[k]!==undefined&&p[k]!==null)a.position[k]=p[k];a.seen=Date.now();bot.emit('actorUpdated',a);}});
 bot.client.on('remove_entity',p=>{for(const [id,a] of bot.actors)if(a.uniqueId===String(p.entity_id_self)){bot.actors.delete(id);bot.emit('actorRemoved',a);}});
 bot.client.on('player_list',p=>{const payload=p.records;const list=Array.isArray(payload)?payload:payload?.records||[];for(const r of list)if((Array.isArray(payload)?r.type:payload.type)==='remove')for(const [id,a]of bot.actors)if(a.uuid===r.uuid)bot.actors.delete(id);});
 bot.client.on('entity_event',p=>{const own=String(p.runtime_entity_id)===String(bot._runtimeEntityId);if(own&&(p.event_id==='consume_totem'||p.event_id===65)){if(/totem/.test(bot.name(bot.offhand?.[0])))bot.offhand[0]=null;bot.emit('totemUsed');}
  if(p.event_id==='death_animation'||p.event_id===3){const actor=bot.actors.get(String(p.runtime_entity_id));if(actor)bot.emit('actorDied',actor);bot.actors.delete(String(p.runtime_entity_id));if(own&&!bot.dead)bot.markDead('entity_event');}
 });
 bot.on('dimensionChanged',()=>bot.actors.clear());bot.on('end',()=>bot.actors.clear());
}
function nearestEnemy(bot,enemies,range=12){if(!bot.entity)return null;for(const a of bot.actors?.values()||[])if(a.player&&a.rawPosition)a.position=require('./positions').serverPosition({blockAt:bot.blockAt},a.rawPosition,'actor');return [...(bot.actors?.values()||[])].filter(a=>a.player&&a.dimension===bot.dimensionId&&a.id!==bot._runtimeEntityId&&enemies.some(e=>norm(e.name)===norm(a.name)&&(!e.xuid||bot.players.get(norm(a.name))?.xuid===e.xuid))&&a.position.distanceTo(bot.entity.position)<=range).sort((a,b)=>a.position.distanceTo(bot.entity.position)-b.position.distanceTo(bot.entity.position))[0]||null;}
function lineOfSight(bot,point){const eye=bot.entity.position.offset(0,1.62,0),delta=point.minus(eye),n=Math.ceil(delta.norm()*5);for(let i=1;i<n;i++){const b=bot.blockAt(eye.plus(delta.scaled(i/n)));if(!b||b.solid||b.name==='unknown')return false;}return true;}
module.exports={trackActors,nearestEnemy,lineOfSight};
