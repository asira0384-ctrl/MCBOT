'use strict';
const equipment=require('../../inventory/equipment/equipment'),hand=require('../../inventory/items/hand'),{lineOfSight}=require('../../../src/bedrock/actors');
const livingTypes=new Set(['hostile','animal','passive','ambient','water_creature','mob']);
function entry(bot,a){if(!a||a.player||a.dimension!==bot.dimensionId||!a.position||String(a.id)===String(bot._runtimeEntityId))return null;const name=String(a.name||'').replace(/^minecraft:/,'');if(/crystal|projectile|arrow|fireball|armor_stand/.test(name))return null;const e=bot.registry?.entitiesByName?.[name];if(['piglin','piglin_brute','magma_cube'].includes(name))return {type:'hostile',height:e?.height||1.8};return e&&livingTypes.has(e.type)?e:null;}
function target(bot,config,range=config.chaseRange??Math.max(12,config.range||4)){
 if(!bot.entity)return null;let nearest=null,nearestDistance=Number(range)||4;
 for(const a of bot.actors?.values()||[]){const e=entry(bot,a);if(!e||config.skip?.(a)||config.targets!=='All Mobs'&&e.type!=='hostile')continue;const distance=a.position.distanceTo(bot.entity.position);if(distance<=nearestDistance){nearest=a;nearestDistance=distance;}}
 return nearest;
}
function weapon(bot,mode){return bot.list().filter(i=>(mode!=='Axe'&&i.name.endsWith('_sword')||mode!=='Sword'&&i.name.endsWith('_axe'))&&!require('../../inventory/items/inventory').touches(bot,i.slot)).sort((a,b)=>equipment.rank(bot,b)-equipment.rank(bot,a)||(b.name.endsWith('_sword')?1:0)-(a.name.endsWith('_sword')?1:0))[0];}
class MobAura{
 constructor(worker){this.worker=worker;this.bot=worker.bot;this.busy=false;this.lastAttack=0;this.state='OFF';this.attacks=0;this.unreachable=new Map();}
 config(){return {enabled:false,range:4,chaseRange:16,delay:500,weapon:'Auto',targets:'Hostile',...this.worker.state.mobAura};}
 async pulse(){
  const w=this.worker,b=this.bot,c=this.config();this.holdsMining=false;if(this.destroyed||!c.enabled||!b.connected||b.dead||b.ended||b.loggingOut||w.runtime?.paused&&!w.running)return false;
  if(c.eatStop!==false&&w.runtime?.config?.eatStop!==false&&b.handUse?.kind==='food'){this.controller?.abort();this.state='食事中はMobAuraを一時停止';return false;}
  if(this.busy)return false;
  if(b.handUse||b.manualInventoryBusy||w.runtime?.consumeTask||w.runtime?.needsFood?.())return false;
  if(w.running&&require('../../../vendor/bedrockflayer/lib/physics/collision').isInLava(b,b.entity))return false;
  const now=Date.now();
  for(const [id,retryAt] of this.unreachable)if(retryAt<=now)this.unreachable.delete(id);
  const a=target(b,{...c,skip:actor=>this.unreachable.has(actor.id)||w.running&&actor.position.y<Number(w.state.floor??-64)+1-.1});if(!a){this.state='索敵範囲内に対象Mobなし';return false;}
  
  const tool=weapon(b,c.weapon);if(!tool){this.state='剣または斧の補給待ち';return false;}
  this.holdsMining=true;
  if(b.actionHandBusy?.kind==='mining'||w.running&&w.busy&&!w.cleanupRequested&&w.mode==='running'){w.abort?.abort();this.state='採掘を一時中断してMobへ対応';return false;}
  if(w.busy||w.controlBusy||b.actionHandBusy)return false;
  if(Date.now()-this.lastAttack<Math.max(100,c.delay))return false;
  this.busy=true;const controller=this.controller=new AbortController();let lease;
  try{
   const distance=a.position.distanceTo(b.entity.position),attackRange=Math.min(Number(c.range)||3,3.0);
   if(distance>attackRange){
    this.state='Mobへ接近中: '+a.name;
    const dx=b.entity.position.x-a.position.x,dz=b.entity.position.z-a.position.z,length=Math.hypot(dx,dz)||1;
    const standOff=Math.max(.4,attackRange-.45);
    const goal=a.position.offset(dx/length*standOff,0,dz/length*standOff),minY=w.running?Number(w.state.floor??-64)+1:-64;
    if(w.runtime?.travel)await w.runtime.travel.walk(goal,'walk',controller.signal,{allowScaffold:false,minY,maxDrop:1});
    else await b.go(goal.floored(),controller.signal);
    return false;
   }
   const current=b.actors.get(String(a.id)),e=entry(b,current);if(!e||current.position.distanceTo(b.entity.position)>attackRange)return false;
   lease=hand.claim(b,'mob');await b.equip(tool.slot,controller.signal);await hand.settled(b,controller.signal,'combat');
   if(this.destroyed||controller.signal.aborted||!this.config().enabled||b.dead||!b.connected||w.runtime?.paused&&!w.running||!entry(b,b.actors.get(String(a.id)))||a.position.distanceTo(b.entity.position)>attackRange||!/(?:_sword|_axe)$/.test(b.name(b.items[b.quickBarSlot])))return false;
   const point=a.position.offset(0,Math.min(1,Math.max(.2,e.height/2)),0);if(!lineOfSight(b,point)){this.unreachable.set(a.id,Date.now()+8000);this.holdsMining=false;this.state='障害物の向こうのMobは後で再確認';return false;}
   b.lookAt(point,false);if(b.attack(a)===false)return false;hand.flush(b);this.lastAttack=Date.now();this.attacks++;this.state='Mobへ近接攻撃: '+a.name;return true;
  }catch(e){if(!controller.signal.aborted&&e.code!=='HAND_BUSY'){this.unreachable.set(a.id,Date.now()+8000);this.holdsMining=false;this.state='届かないMobは後で再確認: '+e.message;}return false;}
  finally{hand.release(b,lease);this.busy=false;if(this.controller===controller)this.controller=null;}
 }
 snapshot(){return {enabled:!!this.config().enabled,state:this.state,attacks:this.attacks};}
 destroy(){this.destroyed=true;this.controller?.abort();}
}
module.exports={MobAura,target,weapon,entry};
