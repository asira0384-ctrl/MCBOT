'use strict';
const {air,solid,norm}=require('./util');const {lineOfSight}=require('./actors');const {useItem}=require('./protocol');
function inHole(bot,enemy){const p=enemy.position.floored();return solid(bot.blockAt(p.offset(0,-1,0)))&&[[1,0],[-1,0],[0,1],[0,-1]].every(([x,z])=>solid(bot.blockAt(p.offset(x,0,z))));}
function buried(bot,enemy){return !!bot.blockAt(enemy.position.offset(0,.5,0))?.solid;}
function ownClear(runtime,point){const b=runtime.bot;if(b.health===null||b.health<16||point.distanceTo(b.entity.position)<3)return false;const realm=b.config;for(const w of runtime.manager.workers?.values()||[]){const other=w.bot;if(other===b||!other.connected||other.dimensionId!==b.dimensionId||other.config?.host!==realm?.host||other.config?.port!==realm?.port)continue;const distance=other.entity?.position.distanceTo(point);if(distance<3.5||distance<8&&other.health!==undefined&&other.health<12)return false;}return true;}
function crystalBase(bot,enemy,runtime){
 const p=enemy.position.floored(),options=[];
 for(let x=-3;x<=3;x++)for(let z=-3;z<=3;z++)for(const y of [-1,0]){
  const q=p.offset(x,y,z),base=bot.blockAt(q),center=q.offset(.5,1,.5);
  if(!base||!['obsidian','bedrock'].includes(base.name)||!air(bot.blockAt(q.offset(0,1,0)))||!air(bot.blockAt(q.offset(0,2,0)))||!bot.reach(base)||!bot.visible(base)||center.distanceTo(enemy.position)>4)continue;
  if(runtime&&!ownClear(runtime,center))continue;
  const occupied=[...(bot.actors?.values()||[])].some(a=>a.player&&Math.abs(a.position.x-center.x)<.8&&Math.abs(a.position.z-center.z)<.8&&a.position.y<center.y+2&&a.position.y+1.8>center.y);
  if(occupied)continue;
  // Prefer close target exposure, farther self distance, and a reachable face.
  const score=center.distanceTo(enemy.position)*3-Math.min(6,center.distanceTo(bot.entity.position))*.5+(runtime&&!lineOfSight(bot,center.offset(0,.5,0))?3:0);
  options.push({base,score});
 }
 return options.sort((a,b)=>a.score-b.score)[0]?.base;
}
class CrystalCombat{
 active(enemy,signal){
  if(!enemy||signal?.aborted||!this.runtime.config.pistoncrystal||enemy.sneaking||!inHole(this.bot,enemy))return false;
  if(this.piston?.hole&&!this.piston.hole.equals(enemy.position.floored()))return false;
  const enemies=this.runtime.manager.store?.data?.enemies;
  return !enemies||this.bot.actors.has(String(enemy.id))&&enemies.some(e=>norm(e.name)===norm(enemy.name));
 }
 placedCrystal(p){return [...this.bot.actors.values()].find(a=>/end(?:er)?_crystal/.test(a.name)&&(!p.crystalId||String(a.id)===p.crystalId)&&a.position.distanceTo(p.base.position.offset(.5,1,.5))<.85);}
 pushedCrystal(p){
  if(!p.crystalId||!p.hole)return null;const a=this.bot.actors.get(p.crystalId),center=p.hole.offset(.5,0,.5);
  return a&&/end(?:er)?_crystal/.test(a.name)&&Math.hypot(a.position.x-center.x,a.position.z-center.z)<.85&&Math.abs(a.position.y-(p.base.position.y+1))<1?a:null;
 }
 constructor(runtime){this.runtime=runtime;this.bot=runtime.bot;this.lastPlace=0;this.lastBreak=0;this.state='OFF';this.piston=null;this.pendingCrystal=null;this.lastAction=null;this.predictedPackets=0;this.boost=null;
  this.onMotion=p=>{if(this.boost?.attackedAt&&String(p.runtime_entity_id)===String(this.bot._runtimeEntityId)&&p.velocity&&Date.now()-this.boost.attackedAt<1000&&Math.hypot(p.velocity.x,p.velocity.y,p.velocity.z)>.1)this.boost.knockbackAt=Date.now();};this.bot.client?.on?.('set_entity_motion',this.onMotion);
 }
 async tick(enemy,signal){const r=this.runtime,b=this.bot;if(!enemy||buried(b,enemy)){if(this.piston)await this.cleanup(signal);this.state='敵が埋まっています';return false;}
  if(r.config.pistoncrystal&&!enemy.sneaking&&inHole(b,enemy))return this.pistonTick(enemy,signal);
  if(this.piston){await this.cleanup(signal);return true;}
  if(!r.config.crystalaura){this.state='CA: OFF';return false;}
  return this.crystalTick(enemy,signal);
 }
 async crystalTick(enemy,signal,base){
  const b=this.bot,r=this.runtime,now=Date.now();this.lastAction=null;
  const crystals=[...(b.actors?.values()||[])].filter(a=>/end(?:er)?_crystal/.test(a.name)&&a.position.distanceTo(enemy.position)<=4&&a.position.distanceTo(b.entity.position)<=4.4&&ownClear(r,a.position)&&lineOfSight(b,a.position.offset(0,.5,0))).sort((a,c)=>a.position.distanceTo(enemy.position)-c.position.distanceTo(enemy.position));
  if(crystals.length&&now-this.lastBreak>=(r.config.crystalBreakDelay||100)){
   if(signal?.aborted||b.handUse)return false;b.lookAt(crystals[0].position.offset(0,.5,0),false);
   if(b.attack(crystals[0])===false)return false;this.lastBreak=now;this.pendingCrystal=null;this.state='Crystal起爆要求';this.lastAction='break';return true;
  }
  if(this.pendingCrystal){if(now-this.pendingCrystal.at<1000){this.state='Crystal受信待ち';return false;}this.pendingCrystal=null;this.state='Crystal未受信・別の面を再確認';}
  if(b.handUse||signal?.aborted)return false;
  const item=b.find('end_crystal');if(!item){this.state='Crystal不足';return false;}
  let support=base||crystalBase(b,enemy,r);
  if(!support&&b.find('obsidian')){
   const p=enemy.position.floored(),candidates=[];
   for(let x=-2;x<=2;x++)for(let z=-2;z<=2;z++){
    const q=p.offset(x,0,z);if(!air(b.blockAt(q))||!solid(b.blockAt(q.offset(0,-1,0)))||!air(b.blockAt(q.offset(0,1,0)))||!air(b.blockAt(q.offset(0,2,0)))||!ownClear(r,q.offset(.5,1,.5))||!b.reach(b.blockAt(q.offset(0,-1,0))))continue;
    if([...(b.actors?.values()||[])].some(a=>a.player&&Math.hypot(a.position.x-q.x-.5,a.position.z-q.z-.5)<1))continue;
    candidates.push(q);
   }
   const q=candidates.sort((a,c)=>a.distanceTo(enemy.position)-c.distanceTo(enemy.position))[0];
   if(q){this.state='CA: 黒曜石の設置面を作成';await b.place(q,b.find('obsidian'),signal);support=b.blockAt(q);}
  }
  if(!support||!ownClear(r,support.position.offset(.5,1,.5))){this.state='安全で届くCrystal設置面がありません';return false;}
  if(now-this.lastPlace<(r.config.crystalPlaceDelay||200))return false;
  b.actionHandBusy=true;try{await b.equip(b.find('end_crystal').slot,signal);if(signal?.aborted||b.handUse)return false;
  b.lookAt(support.position.offset(.5,1,.5),false);this.pendingCrystal={at:Date.now(),position:support.position.offset(.5,1,.5)};
  b.client.queue('inventory_transaction',useItem(b,'click_block',support.position,1,support.stateId));
  this.lastPlace=Date.now();this.lastAction='place';this.state='Crystal設置要求';this.predict(this.pendingCrystal.position);return true;}finally{b.actionHandBusy=false;}
 }
 predict(point){
  const count=Math.min(10,Math.max(0,this.runtime.config.crystalPredict||0)),b=this.bot;
  if(!count||!ownClear(this.runtime,point))return;
  // Bounded prediction is tied to our own reachable placement, never a global ID scan.
  const known=[...(b.actors?.values()||[])].map(a=>BigInt(a.id)).filter(id=>id>0n&&id<9223372036854775807n);
  if(!known.length)return;const max=known.reduce((a,c)=>a>c?a:c),ownIds=new Set([String(b._runtimeEntityId),...[...(this.runtime.manager.workers?.values()||[])].map(w=>String(w.bot._runtimeEntityId))]);
  for(let offset=1;offset<=count;offset++){const id=max+BigInt(offset);if(ownIds.has(String(id))||b.actors.has(String(id)))continue;b.client.queue('inventory_transaction',require('./protocol').attack(b,{id}));this.predictedPackets++;}
 }
 async jetpackTick(enemy,signal){
  const b=this.bot,r=this.runtime,now=Date.now();let boost=this.boost;
  if(boost){
   if(boost.knockbackAt&&!b.actors.has(boost.crystalId)&&now-boost.knockbackAt<1000){
    if(!r.travel.flight)r.travel.flight={goal:enemy.position.clone(),jetpack:true,combat:!!enemy.player,expires:boost.knockbackAt+1000,speed:1.4};
    this.state='Jetpack: 爆風確認・最長1秒';return true;
   }
   if(now-boost.at<1800){this.state='Jetpack: 起爆・ノックバック確認待ち';return false;}
   this.boost=null;this.boostRetryAt=now+2000;return false;
  }
  if(now<(this.boostRetryAt||0)||b.handUse||b.health<18||!b.name(b.offhand?.[0]).includes('totem')){this.state='Jetpack: Totem・体力・クールダウン確認待ち';return false;}
  const item=b.find('end_crystal');if(!item){this.state='Jetpack: Crystal不足';return false;}
  const p=b.entity.position.floored(),options=[];
  for(let x=-3;x<=3;x++)for(let z=-3;z<=3;z++)for(const y of [-1,0]){
   const q=p.offset(x,y,z),center=q.offset(.5,1,.5),distance=center.distanceTo(b.entity.position),block=b.blockAt(q);
   if(distance<1.5||distance>3.5||!air(b.blockAt(q.offset(0,1,0)))||!air(b.blockAt(q.offset(0,2,0))))continue;
   if([...(r.manager.workers?.values()||[])].some(w=>w.bot!==b&&w.bot.connected&&w.bot.dimensionId===b.dimensionId&&w.bot.config.host===b.config.host&&w.bot.config.port===b.config.port&&w.bot.entity.position.distanceTo(center)<8))continue;
   const existing=['obsidian','bedrock'].includes(block?.name);
   if(!existing&&(!air(block)||!solid(b.blockAt(q.offset(0,-1,0)))||!b.find('obsidian')))continue;
   if(!b.reach(existing?block:b.blockAt(q.offset(0,-1,0))))continue;
   const toward=enemy.position.minus(b.entity.position),behind=center.minus(b.entity.position);options.push({q,existing,score:toward.x*behind.x+toward.z*behind.z});
  }
  const plan=options.sort((a,c)=>a.score-c.score)[0];if(!plan){this.state='Jetpack: 隣接した設置面がありません';return false;}
  if(!plan.existing)await b.place(plan.q,b.find('obsidian'),signal);
  if(signal?.aborted)return false;await b.equip(b.find('end_crystal').slot,signal);
  const center=plan.q.offset(.5,1,.5);b.lookAt(center,false);b.client.queue('inventory_transaction',useItem(b,'click_block',plan.q,1,b.blockAt(plan.q).stateId));
  this.boost=boost={at:Date.now(),position:center,crystalId:null};
  try{await b.waitUntil(()=>[...b.actors.values()].some(a=>/end(?:er)?_crystal/.test(a.name)&&a.position.distanceTo(center)<.8),1000,signal);}catch(e){this.boost=null;this.boostRetryAt=Date.now()+2000;if(signal?.aborted)throw e;return false;}
  const crystal=[...b.actors.values()].find(a=>/end(?:er)?_crystal/.test(a.name)&&a.position.distanceTo(center)<.8);boost.crystalId=String(crystal.id);boost.attackedAt=Date.now();b.attack(crystal);return true;
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
 async cleanup(signal){const p=this.piston;if(!p)return;this.state='PA: ホール・しゃがみ条件が変わったため停止';if(p.power){const block=this.bot.blockAt(p.powerPos);if(block?.name==='redstone_block'&&this.bot.tool())await this.bot.dig(block,signal);}this.piston=null;}
 destroy(){this.bot.client?.removeListener?.('set_entity_motion',this.onMotion);}
 snapshot(){return {state:this.state,pistonActive:!!this.piston,lastPlace:this.lastPlace,lastBreak:this.lastBreak,pendingCrystal:this.pendingCrystal,lastAction:this.lastAction,predictedPackets:this.predictedPackets,boost:this.boost};}
}
module.exports={CrystalCombat,inHole,buried,crystalBase,ownClear};
