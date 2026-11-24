'use strict';
const equipment=require('../../equipment'),hand=require('../../hand'),{lineOfSight}=require('../../actors');
const livingTypes=new Set(['hostile','animal','passive','ambient','water_creature','mob']);
function entry(bot,a){if(!a||a.player||a.dimension!==bot.dimensionId||!a.position||String(a.id)===String(bot._runtimeEntityId))return null;const name=String(a.name||'').replace(/^minecraft:/,'');if(/crystal|projectile|arrow|fireball|armor_stand/.test(name))return null;const e=bot.registry?.entitiesByName?.[name];return e&&livingTypes.has(e.type)?e:null;}
function target(bot,config){return [...(bot.actors?.values()||[])].filter(a=>{const e=entry(bot,a);return e&&(config.targets==='All Mobs'||e.type==='hostile')&&a.position.distanceTo(bot.entity.position)<=config.range&&lineOfSight(bot,a.position.offset(0,Math.min(1,Math.max(.2,e.height/2)),0));}).sort((a,b)=>a.position.distanceTo(bot.entity.position)-b.position.distanceTo(bot.entity.position))[0]||null;}
function weapon(bot,mode){return bot.list().filter(i=>(mode!=='Axe'&&i.name.endsWith('_sword')||mode!=='Sword'&&i.name.endsWith('_axe'))&&!require('../../inventory').touches(bot,i.slot)).sort((a,b)=>equipment.rank(bot,b)-equipment.rank(bot,a)||(b.name.endsWith('_sword')?1:0)-(a.name.endsWith('_sword')?1:0))[0];}
class MobAura{
 constructor(worker){this.worker=worker;this.bot=worker.bot;this.busy=false;this.lastAttack=0;this.state='OFF';this.attacks=0;}
 config(){return {enabled:false,range:4,delay:500,weapon:'Auto',targets:'Hostile',...this.worker.state.mobAura};}
 async pulse(){
  const w=this.worker,b=this.bot,c=this.config();if(this.destroyed||this.busy||!c.enabled||!b.connected||b.dead||b.ended||b.loggingOut||w.runtime?.paused&&!w.running)return false;
  if(b.handUse||b.manualInventoryBusy||w.runtime?.consumeTask||w.runtime?.needsFood?.())return false;
  const a=target(b,c);if(!a){this.state='範囲内に対象Mobなし';return false;}
  if(Date.now()-this.lastAttack<Math.max(100,c.delay))return false;
  const tool=weapon(b,c.weapon);if(!tool){this.state='剣または斧の補給待ち';return false;}
  if(b.actionHandBusy?.kind==='mining'){w.abort?.abort();this.state='採掘を一時中断してMobへ対応';return false;}
  if(w.busy||w.controlBusy||b.actionHandBusy)return false;
  this.busy=true;const controller=this.controller=new AbortController();let lease;
  try{lease=hand.claim(b,'mob');await b.equip(tool.slot,controller.signal);await hand.settled(b,controller.signal,'combat');
   if(this.destroyed||controller.signal.aborted||!this.config().enabled||b.dead||!b.connected||w.runtime?.paused&&!w.running||!entry(b,b.actors.get(String(a.id)))||a.position.distanceTo(b.entity.position)>this.config().range||!/(?:_sword|_axe)$/.test(b.name(b.items[b.quickBarSlot])))return false;
   const point=a.position.offset(0,Math.min(1,Math.max(.2,entry(b,a).height/2)),0);if(!lineOfSight(b,point))return false;
   b.lookAt(point,false);if(b.attack(a)===false)return false;hand.flush(b);this.lastAttack=Date.now();this.attacks++;this.state='Mobへ近接攻撃: '+a.name;return true;
  }catch(e){if(!controller.signal.aborted&&e.code!=='HAND_BUSY')this.state='Mob攻撃待ち: '+e.message;return false;}
  finally{hand.release(b,lease);this.busy=false;if(this.controller===controller)this.controller=null;}
 }
 snapshot(){return {enabled:!!this.config().enabled,state:this.state,attacks:this.attacks};}
 destroy(){this.destroyed=true;this.controller?.abort();}
}
module.exports={MobAura,target,weapon,entry};
