'use strict';
const {Vec3}=require('vec3');const {norm,key,solid}=require('./util');const equipment=require('./equipment');const {nearestEnemy,lineOfSight}=require('./actors');const {Travel}=require('./travel');
const defaults={gear:true,autototem:true,autoslot:true,heal:true,healHearts:8,killaura:false,crystalaura:false,pistoncrystal:false,jetpack:false,range:5,chaseRange:30,autolog:true,logHearts:4,anticrystal:false,burrowDepth:.55,flyHorizontal:1.5,flyVertical:.7,chaseSpeed:.27,flightClearance:1,straightTimer:.24,crystalPredict:10,attackDelay:100,crystalPlaceDelay:100,crystalBreakDelay:50,attackAll:false,assist:true,feettrap:false,obsidianFarm:false,blockReach:5,logOnlyEmptyTotem:true};
class Runtime{
 constructor(worker){this.worker=worker;this.bot=worker.bot;this.manager=worker.manager;this.config=worker.state.runtime=Object.assign({},defaults,worker.state.runtime);this.travel=new Travel(this);this.safety=new (require('./safety').WaterSafety)(this);this.busy=false;this.paused=!!worker.state.runtimePaused;this.dirty=false;this.receiving=false;this.attacks=0;this.totemsUsed=0;this.lastAttack=0;this.lastHeal=0;this.lastStrength=0;this.processedBoxes=new Set();this.events=[];this.target=null;this.lastError='';
  if(!worker.state.combatRevision){this.config.autolog=true;this.config.logHearts=4;this.config.healHearts=8;worker.state.combatRevision=26;}
  if((worker.state.tacticsRevision||0)<37){this.config.range=5;this.config.chaseRange=Math.max(30,this.config.chaseRange);this.config.logOnlyEmptyTotem=true;this.config.crystalPlaceDelay=Math.min(100,this.config.crystalPlaceDelay);this.config.crystalBreakDelay=Math.min(50,this.config.crystalBreakDelay);worker.state.tacticsRevision=37;}
  this.telemetry=new(require('./tactics').Telemetry)(this.bot);this.restock=new(require('./restock').Restock)(this);
  this.crystals=new(require('./combat').CrystalCombat)(this);
  this.debug=new(require('./debug').DebugRecorder)(this);
  this.bot.on('inventory',(_,item)=>{if(item&&equipment.wanted(this.bot.name(item))){this.dirty=true;queueMicrotask(()=>{if(!this.destroyed)this.tick().catch(e=>this.noticeOnce('AutoSlot: '+e.message));});}});
  this.bot.on('health',()=>{if(this.config.heal&&!this.paused&&this.bot.health>0&&this.bot.health<=this.config.healHearts*2&&this.bot.find('enchanted_golden_apple')){if(this.worker.running)this.worker.stop();this.startUse('体力回復',this.bot.find('enchanted_golden_apple'));}queueMicrotask(()=>{if(!this.destroyed)this.tick().catch(e=>this.noticeOnce(e.message));});});
  this.bot.on('totemUsed',()=>{this.totemsUsed++;this.worker.stop();this.notice('Totemが割れました。オフハンドを補充します');});
  this.bot.on('death',()=>{this.consumeAbort?.abort();this.travel.stopFollowing();this.safety.cancel();this.abort?.abort();this.travel.cancel(false);this.receiving=false;this.target=null;if(worker.state.respawn)this.bot.requestRespawn();this.notice('死亡・自動リスポーン待ち');});
  this.bot.on('respawned',()=>{this.safety.arm();this.dirty=true;this.telemetry.reset();if(this.worker.state.autoSupply)this.restock.request('死亡後の1kit補充','kit',true);const p=this.bot.entity.position;this.notice(`リスポーンしました。座標: ${Math.floor(p.x)} ${Math.floor(p.y)} ${Math.floor(p.z)} / ${['現世','ネザー','エンド'][this.bot.dimensionId]||this.bot.dimensionId}。装備の補給待ちです`);});
  this.bot.on('collisionBlocked',()=>{this.burrowBlockedUntil=Date.now()+3000;this.speedBlockedUntil=Date.now()+2000;this.travel.recoverAnti?.();this.noticeOnce('ブロックとの重なりを検知。AntiとSpeedを一時停止して足場と位置補正を確認中',false);});
  this.bot.on('forcedMove',()=>{this.travel.rollback();this.telemetry.reset();this.safety.invalidate();});
  this.bot.on('actorAdded',actor=>{if(/end(?:er)?_crystal/.test(actor?.name||'')&&!this.destroyed)queueMicrotask(()=>this.tick().catch(e=>this.noticeOnce(e.message,false)));});
  this.bot.on('end',()=>this.destroy());
  this.motionTimer=setInterval(()=>{try{this.motionTick();}catch(e){this.combatWaiting='経路確認待ち: '+e.message;}},100);this.motionTimer.unref?.();
  this.timer=setInterval(()=>this.tick().catch(e=>{if(e.code==='PATH_WAIT'){this.lastError=e.message;this.travel.waiting=e.message+'（5秒後に再確認）';this.retryAt=Date.now()+5000;this.bot.clearControlStates();this.noticeOnce(this.travel.waiting);return;}if(e.message!==this.lastError){this.lastError=e.message;this.notice(e.message);}this.retryAt=Date.now()+300;if(!this.bot.handUse&&!this.bot.manualInventoryBusy)this.bot.closeContainer();if(this.travel.following)this.travel.following.plannedAt=0;if(this.travel.flight){this.travel.flight.paused='replan';this.travel.flight.retryAt=Date.now()+500;}}),100);this.timer.unref?.();
 }
 prioritize(feature,on=true){
  this.latestFeature=feature;this.featureOrder??={};this.featureOrder[feature]=Date.now();this.abort?.abort();this.bot.closeContainer();if(!this.bot.handUse)this.bot.halt();else{this.bot.pathfinder?.stop();this.bot.clearControlStates();}this.retryAt=0;this.featureErrors={};this.lastError='';this.paused=false;this.worker.state.runtimePaused=false;this.dirty=true;
  if(on&&['killaura','crystalaura','pistoncrystal','pvp'].includes(feature)){this.pendingMove=null;this.travel.cancel(false);this.worker.stop();}
  if(feature==='anticrystal'&&!on){this.travel.unbury();this.burrowBlockedUntil=Date.now()+2000;};
 }
 startUse(kind,item){
  if(this.bot.manualInventoryBusy)return null;if(this.consumeTask||this.bot.handUse)return this.consumeTask;const error=this.featureErrors?.[kind];if(error?.retryAt>Date.now())return null;
  const controller=this.consumeAbort=new AbortController();this.consumeTask=(async()=>{
   try{await (kind==='体力回復'?this.bot.eat(controller.signal):this.bot.drink(item,controller.signal));if(kind==='体力回復')this.lastHeal=Date.now();else this.lastStrength=Date.now();delete this.featureErrors?.[kind];this.dirty=true;this.noticeOnce(kind+'をサーバー更新で確認しました');}
   catch(e){if(!controller.signal.aborted){this.featureErrors??={};this.featureErrors[kind]={message:e.message,at:Date.now(),retryAt:Date.now()+700};this.noticeOnce(kind+': '+e.message,false);}}
   finally{this.consumeTask=null;this.consumeAbort=null;}
  })();return this.consumeTask;
 }
 meleeTick(enemy){
  const b=this.bot;if(!this.config.killaura||b.handUse||b.actionHandBusy||b.pendingStackRequest||this.consumeTask||b.dead||this.paused||this.config.heal&&b.health!==null&&b.health<=this.config.healHearts*2)return;
  if(b.entity.position.distanceTo(enemy.position)>this.config.range||!lineOfSight(b,enemy.position.offset(0,1,0))||Date.now()-this.lastAttack<(this.config.attackDelay||100))return;
  const sword=equipment.best(b,'_sword');if(!sword||sword.slot>=9)return;
  b.select(sword.slot);b.lookAt(enemy.position.offset(0,1,0),false);if(b.attack(enemy)!==false){this.lastAttack=Date.now();this.attacks++;}
 }
 canFight(){return !!(this.config.killaura||this.config.crystalaura||this.config.pistoncrystal||this.config.feettrap);}
 chooseTarget(range=this.config.jetpack?48:this.config.chaseRange){return require('./tactics').target(this,range);}
 motionTick(){
  const b=this.bot;this.telemetry.sample();this.travel.recoverAnti?.();
  if(!b.connected||b.ended||b.dead||this.paused||this.safety.active||!b.entity)return;
  if(this.restock.running){this.travel.stopFollowing();return;}
  const enemy=this.canFight()&&!this.travel.route?this.chooseTarget():null;
  const healing=(this.consumeTask&&b.handUse?.kind==='food')||(this.config.heal&&b.health>0&&b.health<=this.config.healHearts*2&&b.find('enchanted_golden_apple'));
  if(healing&&enemy){
   this.target=enemy;this.travel.unbury();this.burrowBlockedUntil=Date.now()+800;
   if(Date.now()-(this.retreatAt||0)>500||!this.retreatGoal){this.retreatGoal=require('./tactics').retreat(this,enemy);this.retreatAt=Date.now();}
   if(this.retreatGoal)this.travel.follow(this.retreatGoal,.13,'retreat',.5);else this.travel.stopFollowing();
   this.combatWaiting='食事を優先・足場を確認して敵から後退';return;
  }
  if(enemy){this.target=enemy;this.engagedAt=Date.now();this.meleeTick(enemy);this.travel.follow(enemy.position,Date.now()<(this.speedBlockedUntil||0)?0:this.config.chaseSpeed,'chase',this.config.range*.8);}
  else if(this.travel.route&&['walk','dig'].includes(this.travel.route.mode)&&this.travel.route.dimension===b.dimensionId)this.travel.follow(this.travel.route.destination,undefined,'route',.65);
  else if(this.travel.following)this.travel.stopFollowing();
 }

 notice(text,game=true){this.events.push({at:Date.now(),text:String(text).slice(0,250)});this.events=this.events.slice(-12);this.manager.notice(this.worker.id,text,{game});}
 async maintenance(name,fn,signal){this.featureErrors??={};const previous=this.featureErrors[name];if(previous?.retryAt>Date.now())return false;this.operation=name;try{await fn();delete this.featureErrors[name];return true;}catch(e){if(signal.aborted)throw e;if(e.code==='HAND_BUSY')return false;this.featureErrors[name]={message:e.message,at:Date.now(),retryAt:Date.now()+5000};this.bot.closeContainer();this.noticeOnce(`${name}: ${e.message}。この機能だけ5秒待って再試行します`,false);return false;}}
 stop(cancelSafety=true){this.consumeAbort?.abort();this.travel.stopFollowing();if(cancelSafety)this.safety.cancel();this.pendingMove=null;this.paused=true;this.worker.state.runtimePaused=true;this.receiving=false;this.travel.cancel(false);this.abort?.abort();this.bot.closeContainer();}
 requestMove(...args){require('./travel').validateGoal(...args);this.abort?.abort();this.worker.stop();this.bot.closeContainer();this.latestFeature='travel';this.pendingMove=args;this.receiving=false;this.paused=false;this.worker.state.runtimePaused=false;this.retryAt=0;this.manager.store.save();this.notice('移動先を受け付けました。現在の操作を止めて移動します');}
 receive(){this.latestFeature='supply';this.worker.stop();this.stop(false);this.paused=false;this.worker.state.runtimePaused=false;this.retryAt=0;this.processedBoxes.clear();this.receiving=true;this.receivedAt=Date.now();this.dirty=true;this.notice('装備・アイテム・シュルカー受け取り待ち。アイテムは受信直後に整理し、最後の受信から3秒で待機を終了します');}
 snapshot(){return {telemetry:this.telemetry.sample(),restock:this.restock.snapshot(),rollbackRecovery:{antiPaused:Date.now()<(this.burrowBlockedUntil||0),speedPaused:Date.now()<(this.speedBlockedUntil||0)},busy:this.busy,operation:this.operation||null,consumption:this.bot.handUse?{...this.bot.handUse}:null,lastItemUse:this.bot.lastItemUse||null,autoSlotPending:this.dirty,lastAutoSlotVerifiedAt:this.lastSort||null,latestFeature:this.latestFeature||null,lastError:this.lastError,featureErrors:this.featureErrors||{},pendingMove:this.pendingMove||null,waterSafety:this.safety.snapshot(),crystalCombat:this.crystals.snapshot(),inventoryMode:this.bot.inventoryMode,serverAuthoritativeInventory:this.bot.serverAuthoritativeInventory,paused:this.paused,combatWaiting:this.combatWaiting,target:this.target?.name||null,attacksSent:this.attacks,totemsUsed:this.totemsUsed,receiving:this.receiving,travel:this.travel.route?{mode:this.travel.route.mode,dimension:this.travel.route.dimension,destination:this.travel.route.destination}:null,movement:this.travel.waiting,flight:!!this.travel.flight,burrowActive:!!this.travel.embed,config:this.config,offhand:this.bot.name(this.bot.offhand?.[0]),armor:(this.bot.armor||[]).map(i=>this.bot.name(i)),lastEvent:this.events.at(-1)||null};}
 async tick(){const b=this.bot,w=this.worker;if(!b.connected||b.ended||b.loggingOut||!b.entity)return;
  if(b.dead){if(w.state.respawn)b.requestRespawn();return;}
  if(this.config.autolog&&(!this.config.logOnlyEmptyTotem||!b.list().some(i=>/totem/.test(i.name)&&i.count>0)&&!(/totem/.test(b.name(b.offhand?.[0]))&&b.offhand[0].count>0))&&b.health!==null&&b.health>0&&b.health<=this.config.logHearts*2){this.notice(`AutoLog: 体力${b.health/2}ハートで切断します`);this.manager.watchReentry?.(w.id,b,this.target);this.travel.cancel(false);this.abort?.abort();this.safety.cancel();this.worker.stop();await b.logout('あぶねぇwあぶねぇw死にかけたぜw');return;}
  if(this.safety.update()||this.safety.active)return;
  const low=this.config.heal&&b.health!==null&&b.health>0&&b.health<=this.config.healHearts*2;
  if(low&&w.running)w.stop();
  if(low&&!this.paused&&b.find('enchanted_golden_apple'))this.startUse('体力回復',b.find('enchanted_golden_apple'));
  if(this.busy||Date.now()<(this.retryAt||0))return;
  if(low&&w.running){w.stop();}
  if(w.busy)return;
  if(this.pendingMove&&(!low||!b.find('enchanted_golden_apple'))){const args=this.pendingMove;this.pendingMove=null;this.paused=false;this.travel.command(...args);}
  this.busy=true;w.controlBusy=true;this.abort=new AbortController();const signal=this.abort.signal;b.operationSignal=signal;
  try{
   if(low)w.mode='healing';
   if(low&&b.find('enchanted_golden_apple')&&Date.now()-this.lastHeal>=800)this.startUse('体力回復',b.find('enchanted_golden_apple'));
   if(low)await this.maintenance('オフハンド装着',()=>equipment.wear(b,{armor:false,totem:this.config.autototem},signal),signal);
   if(low&&b.find('enchanted_golden_apple')){w.mode='healing';if(Date.now()-this.lastHeal>=800)this.startUse('体力回復',b.find('enchanted_golden_apple'));}
   if(low&&!b.find('enchanted_golden_apple'))this.noticeOnce('回復用エンチャント金リンゴがありません。指定座標への移動は続けます');
   if(w.mode==='healing')w.mode='stopped';if(this.travel.flight?.paused==='health')this.travel.flight.paused=false;
   this.restock.scan();if(!b.handUse&&!this.travel.flight&&await this.restock.tick(signal))return;
   if(this.receiving){this.operation='装備・箱の受け取り';let handled=false;await this.maintenance('シュルカー補給',async()=>{handled=await this.receiveBox(signal);},signal);if(handled)this.dirty=true;if(Date.now()-Math.max(this.receivedAt,b.lastInventoryAt||0)>=3000){this.receiving=false;this.notice('受け取りを終了しました');}}
   const tasks=[
    ['autototem','オフハンド装着',()=>equipment.wear(b,{armor:false,totem:this.config.autototem},signal)],
    ['gear','防具装着',()=>equipment.wear(b,{armor:this.config.gear,totem:false,elytra:!!(this.travel.flight||this.travel.route?.mode==='fly')},signal)],
    ['autoslot','AutoSlot',async()=>{if(this.config.autoslot&&Date.now()>(this.manualSlotsUntil||0)&&(this.dirty||Date.now()-(this.lastSort||0)>5000)&&b.list().some(i=>equipment.wanted(i.name))){const complete=await equipment.autoSlots(b,signal,{pistoncrystal:this.config.pistoncrystal});this.dirty=!complete;if(complete)this.lastSort=Date.now();}}]
   ].sort((a,c)=>(this.featureOrder?.[c[0]]||0)-(this.featureOrder?.[a[0]]||0));
   for(const [,label,run]of tasks)if(!b.manualInventoryBusy)await this.maintenance(label,run,signal);
   if(!this.paused&&!this.receiving&&w.state.autoSupply&&Date.now()-(this.lastSupplyScan||0)>3000){this.lastSupplyScan=Date.now();this.restock.scan();}
   if(this.paused)return;
   if(this.config.anticrystal&&!b.handUse&&!this.travel.route&&!this.travel.flight&&!this.travel.embed&&Date.now()>(this.burrowBlockedUntil||0))this.travel.bury(this.config.burrowDepth);
   
   const enemy=this.canFight()&&!low?this.chooseTarget():null;this.target=enemy;if(enemy)this.engagedAt=Date.now();this.combatWaiting=low?'敵から離れながら回復を優先':enemy?`敵: ${enemy.name}`:this.config.attackAll?'30ブロック以内に攻撃対象がいません':'登録した敵・援護対象が検知範囲にいません';
   if(enemy&&!this.travel.route){this.operation='指定した敵との戦闘';if(w.running)w.stop();if(this.travel.flight&&!this.travel.flight.combat){if(!this.travel.flight.landing&&!this.travel.flight.paused)this.travel.cancel();return;}await this.combat(enemy,signal);return;}
   if(this.crystals.piston)await this.crystals.cleanup(signal);
   this.operation=this.travel.route?'座標移動':null;if(!this.config.anticrystal||this.travel.route)this.travel.unbury();b.setControlState('sneak',false);await this.travel.tick(signal);this.lastError='';
  }catch(e){if(!signal.aborted)throw e;}finally{if(b.operationSignal===signal)b.operationSignal=null;this.operation=null;this.busy=false;w.controlBusy=false;}
 }
 noticeOnce(text,game=true){if(this.lastWarning===text&&Date.now()-(this.lastWarningAt||0)<30000)return;this.lastWarning=text;this.lastWarningAt=Date.now();this.notice(text,game);}
 async combat(enemy,signal){const b=this.bot,point=enemy.position.offset(0,1,0);
  if(this.config.anticrystal&&!b.handUse&&!this.travel.embed&&Date.now()>(this.burrowBlockedUntil||0))this.travel.bury(this.config.burrowDepth);
  const effect=b.effects.get(5);const potion=equipment.strengthPotion(b);
  if(potion&&(!effect||effect.expires<=Date.now())&&Date.now()-this.lastStrength>10000)this.startUse('力のポーション',potion);
  if(signal?.aborted||!b.actors.has(String(enemy.id))||!require('./tactics').eligible(this,enemy))return;
  if(this.consumeTask||b.handUse){this.combatWaiting='飲食しながら追尾中';return;}
  if(this.config.jetpack&&b.entity.position.distanceTo(enemy.position)>8){await this.maintenance('Jetpack',()=>this.crystals.jetpackTick(enemy,signal),signal);if(this.travel.flight?.jetpack)return;}
  const doCrystals=async()=>{if(this.config.crystalaura||this.config.pistoncrystal||this.crystals.piston)await this.maintenance('Crystal/PA',()=>this.crystals.tick(enemy,signal),signal);};
  const distance=b.entity.position.distanceTo(enemy.position);
  if(this.config.killaura&&distance<=this.config.range&&lineOfSight(b,point)){
   const sword=equipment.best(b,'_sword');
   if(sword){
    if(Date.now()-this.lastAttack>=(this.config.attackDelay||100)){
     await b.equip(sword.slot,signal);
     const current=b.actors.get(String(enemy.id));
     if(signal?.aborted||!current||this.paused||!this.config.killaura||b.handUse)return;
     b.lookAt(current.position.offset(0,1,0),false);
     if(b.attack(current)!==false){this.attacks++;this.lastAttack=Date.now();}
    }
   }else this.combatWaiting='戦闘用の剣がありません';
  }else if(this.config.killaura||this.config.crystalaura||this.config.pistoncrystal){
   this.travel.follow(enemy.position,Date.now()<(this.speedBlockedUntil||0)?0:this.config.chaseSpeed,'chase',this.config.range*.85);
   if(distance<=this.config.range&&!lineOfSight(b,point))this.combatWaiting='壁を避けて敵に接近中';
  }
  if(this.config.feettrap)await this.maintenance('FeetTrap',()=>this.crystals.feetTrap(enemy,signal),signal);
  await doCrystals();

 }
 async receiveBox(signal){const b=this.bot,w=this.worker;let state=w.state.autoBox;
  if(!state){let position=null,name=null;const p=b.entity.position;for(let x=Math.floor(p.x)-10;x<=Math.floor(p.x)+10;x++)for(let z=Math.floor(p.z)-10;z<=Math.floor(p.z)+10;z++)for(let y=Math.floor(p.y)-3;y<=Math.floor(p.y)+3;y++){const q=new Vec3(x,y,z),block=b.blockAt(q);if(block&&/shulker_box$/.test(block.name)&&p.distanceTo(q)<=10&&Date.now()-(this.boxVisited?.get(key(q))||0)>10000&&(!position||p.distanceTo(q)<p.distanceTo(position))){position=q;name=block.name;}}
   const external=!!position;if(!position){const box=b.list().find(i=>/shulker_box$/.test(i.name)&&!this.processedBoxes.has(i.name+':'+i.raw.stack_id));if(!box)return false;position=w.supplySpot();name=box.name;await b.openInventory(signal);if(box.slot!==8)await b.swap(box.slot,8);b.closeContainer();state=w.state.autoBox={name,position:{x:position.x,y:position.y,z:position.z},phase:'placing'};this.manager.store.save();await w.placeOwned(position,b.find(name),'shulker',signal);}
   state=w.state.autoBox={name,position:{x:position.x,y:position.y,z:position.z},phase:'placed',external};this.manager.store.save();
  }
  const pos=new Vec3(state.position.x,state.position.y,state.position.z);
  if(state.phase==='placing'){const block=b.blockAt(pos);if(!block||block.name!==state.name)throw Error('補給シュルカーの設置を確認できません。手動確認してください');state.phase='placed';}
  if(state.phase==='placed'){
   if(!b.reach({position:pos})){this.travel.unbury();const p=b.entity.position,approach=pos.offset(Math.sign(p.x-pos.x)*2,0,Math.sign(p.z-pos.z)*2);await this.travel.walk(approach,'walk',signal);this.receivedAt=Date.now();return false;}
   const box=await b.openContainer(pos,signal);if(box.items.length!==27)throw Error('シュルカーの27枠を確認できません');
   for(let slot=0;slot<box.items.length;slot++){const raw=box.items[slot];if(!raw)continue;const amount=require('./supply-needs').desired(b,b.name(raw),raw,this.config);if(!amount)continue;if(b.items.filter(i=>!i).length<=1)break;const free=b.items.findIndex(i=>!i);if(free<0)break;await b.transfer(true,slot,false,free,Math.min(amount,raw.count));}
   if(state.external){b.closeContainer();this.boxVisited??=new Map();this.boxVisited.set(key(pos),Date.now());w.state.autoBox=null;this.manager.store.save();this.dirty=true;this.receivedAt=Date.now();return true;}
   state.empty=box.items.every(i=>!i||!i.network_id);b.closeContainer();this.manager.store.save();
   if(!b.items.some(i=>!i))throw Error('シュルカーの回収用にインベントリを1枠空けてください');const item=await w.collectPlaced(pos,state.name,signal);state.phase='carried';state.stackId=item.raw.stack_id;this.manager.store.save();
  }
  if(state.phase==='stored'){await w.recoverChest(new Vec3(state.chest.x,state.chest.y,state.chest.z),signal);w.state.autoBox=null;this.manager.store.save();return true;}
  const item=b.list().find(i=>i.name===state.name&&i.raw.stack_id===state.stackId);if(!item)throw Error('回収した補給シュルカーの識別ができません。手動確認してください');
  if(state.empty)await b.drop(item.slot,1);else if(b.find('ender_chest')&&b.tool(true)||state.chest){
   let chestPos;if(state.chest)chestPos=new Vec3(state.chest.x,state.chest.y,state.chest.z);else{chestPos=w.supplySpot();state.chest={x:chestPos.x,y:chestPos.y,z:chestPos.z};this.manager.store.save();await w.placeOwned(chestPos,b.find('ender_chest'),'ender_chest',signal);}
   const chest=await b.openContainer(chestPos,signal),free=chest.items.findIndex(i=>!i);if(free<0)throw Error('エンダーチェストが満杯です。シュルカーを保持します');await b.transfer(false,item.slot,true,free,1);b.closeContainer();state.phase='stored';this.manager.store.save();await w.recoverChest(chestPos,signal);
  }else this.notice('中身入りシュルカーを保持しました。エンダーチェストとシルクタッチがあれば収納できます');
  this.processedBoxes.add(item.name+':'+item.raw.stack_id);w.state.autoBox=null;this.manager.store.save();this.dirty=true;this.receivedAt=Date.now();this.notice('シュルカーから装備を取り出しました');return true;
 }
 destroy(){if(this.destroyed)return;this.destroyed=true;this.consumeAbort?.abort();clearInterval(this.motionTimer);this.travel.stopFollowing();this.debug.destroy();this.crystals.destroy();this.safety.cancel();clearInterval(this.timer);this.abort?.abort();this.travel.route=null;this.travel.flight=null;this.travel.embed=null;}
}
module.exports={Runtime,defaults};
