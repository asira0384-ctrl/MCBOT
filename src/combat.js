'use strict';
const {air,solid,norm}=require('./util');const {lineOfSight}=require('./actors');const {useItem}=require('./protocol');
function inHole(bot,enemy){const p=enemy.position.floored();return solid(bot.blockAt(p.offset(0,-1,0)))&&[[1,0],[-1,0],[0,1],[0,-1]].every(([x,z])=>solid(bot.blockAt(p.offset(x,0,z))));}
function buried(bot,enemy){return !!bot.blockAt(enemy.position.offset(0,.5,0))?.solid;}
function ownClear(runtime,point){const b=runtime.bot;if(b.health===null||b.health<16||point.distanceTo(b.entity.position)<3)return false;const realm=b.config;for(const w of runtime.manager.workers?.values()||[]){const other=w.bot;if(other===b||!other.connected||other.dimensionId!==b.dimensionId||other.config?.host!==realm?.host||other.config?.port!==realm?.port)continue;if(other.entity?.position.distanceTo(point)<12)return false;}return true;}
function crystalBase(bot,enemy){const p=enemy.position.floored();const options=[];for(let x=-2;x<=2;x++)for(let z=-2;z<=2;z++){const q=p.offset(x,-1,z),base=bot.blockAt(q);if(base&&['obsidian','bedrock'].includes(base.name)&&air(bot.blockAt(q.offset(0,1,0)))&&air(bot.blockAt(q.offset(0,2,0)))&&bot.reach(base)&&bot.visible(base))options.push(base);}return options.sort((a,b)=>a.position.distanceTo(enemy.position)-b.position.distanceTo(enemy.position))[0];}
class CrystalCombat{
 active(enemy,signal){
  if(!enemy||signal?.aborted||!this.runtime.config.pistoncrystal||!inHole(this.bot,enemy))return false;
  if(this.piston?.hole&&!this.piston.hole.equals(enemy.position.floored()))return false;
  const enemies=this.runtime.manager.store?.data?.enemies;
  return !enemies||this.bot.actors.has(String(enemy.id))&&enemies.some(e=>norm(e.name)===norm(enemy.name));
 }
 placedCrystal(p){return [...this.bot.actors.values()].find(a=>/end(?:er)?_crystal/.test(a.name)&&(!p.crystalId||String(a.id)===p.crystalId)&&a.position.distanceTo(p.base.position.offset(.5,1,.5))<.85);}
 pushedCrystal(p){
  if(!p.crystalId||!p.hole)return null;const a=this.bot.actors.get(p.crystalId),center=p.hole.offset(.5,0,.5);
  return a&&/end(?:er)?_crystal/.test(a.name)&&Math.hypot(a.position.x-center.x,a.position.z-center.z)<.85&&Math.abs(a.position.y-(p.base.position.y+1))<1?a:null;
 }
 constructor(runtime){this.runtime=runtime;this.bot=runtime.bot;this.lastPlace=0;this.lastBreak=0;this.state='OFF';this.piston=null;}
 async tick(enemy,signal){const r=this.runtime,b=this.bot;if(!enemy||buried(b,enemy)){if(this.piston)await this.cleanup(signal);this.state='敵が埋まっています';return false;}
  if(r.config.pistoncrystal&&inHole(b,enemy))return this.pistonTick(enemy,signal);
  if(this.piston){await this.cleanup(signal);return true;}
  if(!r.config.crystalaura){this.state='CA: OFF';return false;}
  return this.crystalTick(enemy,signal);
 }
 async crystalTick(enemy,signal,base){const b=this.bot,r=this.runtime,crystals=[...(b.actors?.values()||[])].filter(a=>/end(?:er)?_crystal/.test(a.name)&&a.position.distanceTo(enemy.position)<=3&&a.position.distanceTo(b.entity.position)<=4.4&&ownClear(r,a.position)&&lineOfSight(b,a.position.offset(0,.5,0)));
  if(crystals.length&&Date.now()-this.lastBreak>=350){if(signal?.aborted)return false;b.lookAt(crystals[0].position.offset(0,.5,0),false);b.attack(crystals[0]);this.lastBreak=Date.now();this.state='Crystal起爆要求';return true;}
  const item=b.find('end_crystal'),support=base||crystalBase(b,enemy);if(!item){this.state='Crystal不足';return false;}if(!support||!ownClear(r,support.position.offset(.5,1,.5))){this.state='安全なCrystal設置面がありません';return false;}if(Date.now()-this.lastPlace<1200)return false;
  await b.equip(item.slot);if(signal?.aborted)return false;b.lookAt(support.position.offset(.5,1,.5),false);b.client.queue('inventory_transaction',useItem(b,'click_block',support.position,1,support.stateId));this.lastPlace=Date.now();this.state='Crystal設置要求・エンティティ受信待ち';return true;
 }
 plan(enemy){const b=this.bot,p=enemy.position.floored();for(const [x,z]of [[1,0],[-1,0],[0,1],[0,-1]]){const base=b.blockAt(p.offset(x,0,z)),pistonPos=p.offset(x*2,1,z*2),support=b.blockAt(pistonPos.offset(0,-1,0)),pedestal=air(support)&&!!b.find('obsidian')&&solid(b.blockAt(pistonPos.offset(0,-2,0))),powerPos=pistonPos.offset(z,0,-x);if(base&&['obsidian','bedrock'].includes(base.name)&&air(b.blockAt(base.position.offset(0,1,0)))&&air(b.blockAt(base.position.offset(0,2,0)))&&(solid(support)||pedestal)&&air(b.blockAt(pistonPos))&&air(b.blockAt(powerPos))&&b.reach(support)&&b.reach(base))return {base,pistonPos,powerPos,pedestal,facing:x===1?4:x===-1?5:z===1?2:3,enemyId:String(enemy.id)};}return null;}
 async pistonTick(enemy,signal){
  const b=this.bot;let p=this.piston;
  if(p&&p.enemyId!==String(enemy.id)){await this.cleanup(signal);return true;}
  if(!this.active(enemy,signal)){await this.cleanup(signal);return false;}
  if(!p){
   const plan=this.plan(enemy);
   if((!b.find('piston')&&!b.find('sticky_piston'))||!b.find('redstone_block')||!b.find('end_crystal')){this.state='PA: ピストン・レッドストーンブロック・Crystalが必要';return false;}
   if(!plan){this.state='PA: 到達可能な設置配置がありません';return false;}
   if(!ownClear(this.runtime,plan.base.position.offset(.5,1,.5))){this.state='PA: 自分・他Botへの爆発を回避';return false;}
   const support=plan.pistonPos.offset(0,-1,0);
   // Use the existing floor as-is. Build an obsidian pedestal only in known air.
   if(!solid(b.blockAt(support))){
    if(!air(b.blockAt(support))){this.state='PA: 足場位置が変化しました';return false;}
    const obsidian=b.find('obsidian');if(!obsidian){this.state='PA: 足場用の黒曜石が必要';return false;}
    this.state='PA: 黒曜石の足場を設置';await b.place(support,obsidian,signal);
   }
   if(!this.active(enemy,signal))return false;
   await b.place(plan.pistonPos,b.find('piston')||b.find('sticky_piston'),signal,{facing:plan.facing});
   this.piston=p={...plan,hole:enemy.position.floored(),placed:true,power:false};this.state='PA: ピストン方向を確認';
  }
  const block=b.blockAt(p.pistonPos),facing=Number(block?.properties?.facing_direction);
  if(!['piston','sticky_piston'].includes(block?.name)||facing!==p.facing){this.state='PA: ピストンが敵を向いていません。起動を中止';return false;}
  let crystal=this.placedCrystal(p)||this.pushedCrystal(p);
  if(!crystal&&p.crystalId&&b.actors.has(p.crystalId)){this.state='PA: Crystal位置の確認待ち';return true;}
  if(!crystal){
   p.crystalId=null;
   if(p.power){
    const power=b.blockAt(p.powerPos);
    if(power?.name==='redstone_block'){if(!b.tool()){this.state='PA: 再装填用のピッケルが必要';return false;}await b.dig(power,signal);}
    p.power=false;this.state='PA: 電源を外して再装填';
   }
   if(Date.now()<(p.retryAt||0))return false;
   const item=b.find('end_crystal');
   if(!item||!ownClear(this.runtime,p.base.position.offset(.5,1,.5))){this.state='PA: Crystal不足・安全確認待ち';return false;}
   await b.equip(item.slot);
   if(!this.active(enemy,signal)){await this.cleanup(signal);return false;}
   b.lookAt(p.base.position.offset(.5,1,.5),false);
   b.client.queue('inventory_transaction',useItem(b,'click_block',p.base.position,1,p.base.stateId));
   this.lastPlace=Date.now();this.state='PA: Crystalの受信待ち';
   try{await b.waitUntil(()=>!!this.placedCrystal(p)||!this.active(enemy,signal),1500,signal);}
   catch(e){if(signal?.aborted||b.ended)throw e;p.retryAt=Date.now()+1500;this.state='PA: Crystal設置が未確認';return false;}
   crystal=this.placedCrystal(p);
  }
  if(!this.active(enemy,signal)){await this.cleanup(signal);return false;}
  // Continue in this operation, without waiting for another combat tick.
  if(crystal&&!p.power){
   p.crystalId=String(crystal.id);
   if(!ownClear(this.runtime,crystal.position))return false;
   const item=b.find('redstone_block');if(!item){this.state='PA: レッドストーンブロック不足';return false;}
   await b.place(p.powerPos,item,signal);p.power=true;this.state='PA: ピストン起動・押し込み待ち';
  }
  if(p.power&&!this.pushedCrystal(p)){
   try{await b.waitUntil(()=>!!this.pushedCrystal(p)||!this.active(enemy,signal),1000,signal);}
   catch(e){if(signal?.aborted||b.ended)throw e;this.state='PA: 押し込みが未確認';return true;}
  }
  if(!this.active(enemy,signal)){await this.cleanup(signal);return false;}
  const pushed=this.pushedCrystal(p);
  if(pushed&&ownClear(this.runtime,pushed.position)&&pushed.position.distanceTo(b.entity.position)<=4.4&&lineOfSight(b,pushed.position.offset(0,.5,0))&&Date.now()-this.lastBreak>=350){b.lookAt(pushed.position.offset(0,.5,0),false);b.attack(pushed);this.lastBreak=Date.now();this.state='PA: 押し込みを確認して起爆要求';}
  return true;
 }
 async cleanup(signal){const p=this.piston;if(!p)return;this.state='PA: 敵がホールを出たため停止';if(p.power){const block=this.bot.blockAt(p.powerPos);if(block?.name==='redstone_block'&&this.bot.tool())await this.bot.dig(block,signal);}this.piston=null;}
 snapshot(){return {state:this.state,pistonActive:!!this.piston,lastPlace:this.lastPlace,lastBreak:this.lastBreak};}
}
module.exports={CrystalCombat,inHole,buried,crystalBase,ownClear};
