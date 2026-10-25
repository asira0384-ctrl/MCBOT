'use strict';
const {Vec3}=require('vec3');const {norm,key,solid}=require('./util');const equipment=require('./equipment');const {nearestEnemy,lineOfSight}=require('./actors');const {Travel}=require('./travel');
const defaults={gear:true,autototem:true,autoslot:true,heal:true,healHearts:8,killaura:false,crystalaura:false,pistoncrystal:false,jetpack:false,range:5,chaseRange:30,autolog:true,logHearts:4,anticrystal:false,burrowDepth:.55,flyHorizontal:1.5,flyVertical:.7,chaseSpeed:.27,flightClearance:1,straightTimer:.24,crystalPredict:10,attackDelay:75,crystalPlaceDelay:50,crystalBreakDelay:25,attackAll:false,assist:true,feettrap:false,obsidianFarm:false,blockReach:5,logOnlyEmptyTotem:true,logMode:'empty-health',logAbsorption:false,noSlow:true,eatSpeed:.12};
class Runtime{
 constructor(worker){this.worker=worker;this.bot=worker.bot;this.manager=worker.manager;this.config=worker.state.runtime=Object.assign({},defaults,worker.state.runtime);this.travel=new Travel(this);this.safety=new (require('./safety').WaterSafety)(this);this.busy=false;this.paused=!!worker.state.runtimePaused;this.dirty=false;this.receiving=false;this.attacks=0;this.totemsUsed=0;this.lastAttack=0;this.lastHeal=0;this.lastStrength=0;this.processedBoxes=new Set();this.events=[];this.target=null;this.lastError='';
  if(!worker.state.combatRevision){this.config.autolog=true;this.config.logHearts=4;this.config.healHearts=8;worker.state.combatRevision=26;}
  if((worker.state.tacticsRevision||0)<37){this.config.range=5;this.config.chaseRange=Math.max(30,this.config.chaseRange);this.config.logOnlyEmptyTotem=true;this.config.crystalPlaceDelay=Math.min(100,this.config.crystalPlaceDelay);this.config.crystalBreakDelay=Math.min(50,this.config.crystalBreakDelay);worker.state.tacticsRevision=37;}
  if((worker.state.tacticsRevision||0)<38){this.config.attackDelay=Math.min(75,this.config.attackDelay);this.config.crystalPlaceDelay=Math.min(50,this.config.crystalPlaceDelay);this.config.crystalBreakDelay=Math.min(25,this.config.crystalBreakDelay);this.config.noSlow=true;this.config.eatSpeed??=.12;worker.state.tacticsRevision=38;}
  if(Object.hasOwn(this.config,'attackall')){this.config.attackAll=!!this.config.attackall;delete this.config.attackall;}
  if(require('./realms').isIgn(this))this.config.anticrystal=false;this.bot.pistonWireOpposite=worker.state.pistonWireEncoding==='opposite';
  if(['look','opposite'].includes(worker.state.pistonFacingMode))this.bot.pistonFacingMode=worker.state.pistonFacingMode;
  this.telemetry=new(require('./tactics').Telemetry)(this.bot);this.restock=new(require('./restock').Restock)(this);
  this.crystals=new(require('./combat').CrystalCombat)(this);
  this.debug=new(require('./debug').DebugRecorder)(this);
  this.autoLog=new(require('./auto-log').AutoLog)(this);this.ignActions=new(require('./ign-actions').IgnActions)(this);this.follower=new(require('./follow').TrailFollower)(this);this.selfDefense=new(require('./self-defense').SelfDefense)(this);
  this.onEquipment=()=>this.wakeEquipment();this.bot.on('inventorySnapshot',this.onEquipment);this.bot.on('totemUsed',this.onEquipment);
  this.bot.on('inventory',(_,item)=>{if(item&&equipment.wanted(this.bot.name(item))){this.dirty=true;queueMicrotask(()=>{if(!this.destroyed)this.tick().catch(e=>this.noticeOnce('AutoSlot: '+e.message));});}});
  this.bot.on('health',()=>{if(this.bot.health>this.config.healHearts*2)this.healLatch=null;if(this.needsFood()){if(this.worker.running){this.resumeMining=true;this.worker.stop();}this.startUse('体力回復',this.bot.find('enchanted_golden_apple'));}queueMicrotask(()=>{if(!this.destroyed)this.tick().catch(e=>this.noticeOnce(e.message));});});
  this.bot.on('totemUsed',()=>{this.totemsUsed++;if(this.worker.running)this.worker.stop();this.wakeEquipment();this.notice('Totemが割れました。オフハンドを補充します');});
  this.bot.on('dimensionChanged',()=>{this.combatAbort?.abort();this.consumeAbort?.abort();});
  this.bot.on('death',()=>{this.combatAbort?.abort();this.consumeAbort?.abort();this.travel.stopFollowing();this.safety.cancel();this.abort?.abort();this.travel.cancel(false);this.receiving=false;this.target=null;if(worker.state.respawn)this.bot.requestRespawn();this.notice('死亡・自動リスポーン待ち');});
  this.bot.on('respawned',()=>{this.safety.arm();this.dirty=true;this.telemetry.reset();if(this.worker.state.autoSupply&&!(this.ignActions.enabled&&this.ignActions.settings.autoKit))this.restock.request('死亡後の1kit補充','kit',true);const p=this.bot.entity.position;this.notice(`リスポーンしました。座標: ${Math.floor(p.x)} ${Math.floor(p.y)} ${Math.floor(p.z)} / ${['現世','ネザー','エンド'][this.bot.dimensionId]||this.bot.dimensionId}。装備の補給待ちです`);});
  this.bot.on('collisionBlocked',()=>{this.speedBlockedUntil=Date.now()+2000;if(this.protectAnti()){this.travel.recoverAnti();this.noticeOnce('戦闘中のAntiを維持し、受信した足場と追尾経路を再確認中',false);}else{this.burrowBlockedUntil=Date.now()+3000;this.travel.recoverAnti?.(!this.paused);this.noticeOnce('ブロックとの重なりを検知。足場と位置補正を確認中',false);}});
  this.onHandAvailable=()=>{if(this.pendingFood&&!this.destroyed){this.pendingFood=false;queueMicrotask(()=>{if(this.needsFood())this.startUse('体力回復',this.bot.find('enchanted_golden_apple'));});}if(this.dirty&&!this.destroyed)this.wakeEquipment();};this.bot.on('handAvailable',this.onHandAvailable);
  this.bot.on('forcedMove',()=>{this.travel.rollback();this.telemetry.reset();this.safety.invalidate();});
  this.bot.on('actorAdded',()=>this.wakeCombat());this.bot.on('actorRemoved',()=>this.wakeCombat());this.bot.on('actorUpdated',()=>this.wakeCombat());
  this.bot.on('end',()=>this.destroy());
  this.combatTimer=setInterval(()=>this.wakeCombat(),25);this.combatTimer.unref?.();
  this.motionTimer=setInterval(()=>{const at=Date.now(),started=performance.now();this.loopTiming??={maxLagMs:0};const lag=Math.max(0,at-(this.lastMotionAt||at)-50);this.lastMotionAt=at;this.loopTiming.lagMs=lag;this.loopTiming.maxLagMs=Math.max(this.loopTiming.maxLagMs,lag);try{this.motionTick();}catch(e){this.combatWaiting='経路確認待ち: '+e.message;}finally{this.loopTiming.motionMs=+(performance.now()-started).toFixed(2);}},50);this.motionTimer.unref?.();
  this.timer=setInterval(()=>this.tick().catch(e=>{if(e.code==='PATH_WAIT'){this.lastError=e.message;this.travel.waiting=e.message+'（経路を再確認）';this.retryAt=Date.now()+600;this.travel.groundPlan=null;this.bot.clearControlStates();this.noticeOnce(this.travel.waiting,false);return;}if(e.message!==this.lastError){this.lastError=e.message;this.notice(e.message);}this.retryAt=Date.now()+300;if(!this.bot.handUse&&!this.bot.manualInventoryBusy)this.bot.closeContainer();if(this.travel.following)this.travel.following.plannedAt=0;if(this.travel.flight){this.travel.flight.paused='replan';this.travel.flight.retryAt=Date.now()+500;}}),100);this.timer.unref?.();
 }
 prioritize(feature,on=true){this.resumeCleanup=false;this.resumeMining=false;
  if(!on&&['feettrap','pvp'].includes(feature)){this.crystals.trapAbort?.abort();this.selfDefense.stop();}
  this.combatAbort?.abort();this.latestFeature=feature;this.featureOrder??={};this.featureOrder[feature]=Date.now();this.abort?.abort();this.bot.closeContainer();if(!this.bot.handUse)this.bot.halt();else{this.bot.pathfinder?.stop();this.bot.clearControlStates();}this.retryAt=0;this.featureErrors={};this.lastError='';this.paused=false;this.worker.state.runtimePaused=false;this.dirty=true;
  if(on&&['killaura','crystalaura','pistoncrystal','pvp'].includes(feature)){this.pendingMove=null;this.travel.cancel(false,{preserveAnti:this.config.anticrystal});this.worker.stop();}
  if(feature==='jetpack'&&!on){this.crystals.boost=null;if(this.travel.flight?.jetpack)this.travel.cancel(false,{preserveAnti:true});}
  if(feature==='anticrystal'&&!on){this.travel.unbury();this.burrowBlockedUntil=Date.now()+2000;};
 }
 startUse(kind,item){
  if(this.bot.manualInventoryBusy)return null;if(this.consumeTask||this.bot.handUse)return this.consumeTask;if(kind==='体力回復'&&this.healLatch&&!this.needsFood())return null;const error=this.featureErrors?.[kind];if(error?.retryAt>Date.now())return null;
  // Finish/cancel an in-flight placement before selecting food; two concurrent
  // equip continuations can otherwise replace the apple just after click_air.
  this.combatAbort?.abort();this.crystals.trapAbort?.abort();
  if(kind==='体力回復'){this.bot.urgentFoodPending=true;if(this.worker.running){this.resumeMining=true;this.worker.stop();}else if(this.worker.cleanupRequested){this.resumeCleanup=true;this.worker.stop();}this.abort?.abort();}
  if(this.bot.actionHandBusy){if(kind==='体力回復')this.pendingFood=true;return null;}
  const controller=this.consumeAbort=new AbortController();this.consumeTask=(async()=>{
   try{await (kind==='体力回復'?this.bot.eat(controller.signal):this.bot.drink(item,controller.signal));if(kind==='体力回復'){this.lastHeal=Date.now();this.healLatch={at:this.lastHeal,health:this.bot.health};}else this.lastStrength=Date.now();delete this.featureErrors?.[kind];this.dirty=true;this.noticeOnce(kind+'をサーバー更新で確認しました');}
   catch(e){if(!controller.signal.aborted){this.featureErrors??={};this.featureErrors[kind]={message:e.message,at:Date.now(),retryAt:Date.now()+700};this.noticeOnce(kind+': '+e.message,false);}}
   finally{this.consumeTask=null;this.consumeAbort=null;this.bot.urgentFoodPending=false;this.bot.emit('handAvailable');}
  })();return this.consumeTask;
 }
 needsFood(){
  const b=this.bot;if(!this.config.heal||this.paused||!b.connected||b.dead||!(b.health>0&&b.health<=this.config.healHearts*2)||!b.find('enchanted_golden_apple'))return false;
  const last=this.healLatch;if(!last)return true;const elapsed=Date.now()-last.at;if(elapsed<2500)return false;
  // Rearm after fresh damage, or after the server's regeneration expires.
  const regeneration=b.effects?.get(10);return b.health<last.health||(!regeneration||regeneration.expires<=Date.now())&&elapsed>=5000;
 }
 meleeTick(enemy){if(this.meleeTask)return this.meleeTask;const task=this.performMelee(enemy).finally(()=>{if(this.meleeTask===task)this.meleeTask=null;});this.meleeTask=task;task.catch(e=>{if(e.code!=='HAND_BUSY')this.meleeState='剣の確認待ち: '+e.message;});return task;}
 async performMelee(enemy,signal){
  const b=this.bot;this.meleeState='待機';if(!this.config.killaura||b.dead||this.paused||this.paOwnsHand(enemy))return false;if(b.handUse||b.actionHandBusy||this.consumeTask||this.needsFood()){this.meleeState='手の操作・食事を優先';return false;}
  if(b.entity.position.distanceTo(enemy.position)>this.config.range){this.meleeState='射程外';return false;}if(!this.canSeeEnemy(enemy)){this.meleeState='壁で遮られています';return false;}if(Date.now()-this.lastAttack<(this.config.attackDelay||100))return false;
  const sword=this.combatSword();if(!sword||require('./inventory').touches(b,sword.slot)||require('./inventory').touches(b,b.quickBarSlot)||sword.slot>=9&&b.pendingStackRequest){this.meleeState='剣の装填・サーバー確認待ち';return false;}
  const hand=require('./hand'),lease=hand.claim(b,'melee');
  try{await b.equip(sword.slot,signal);const aim=this.aimAtEnemy(enemy);if(aim)b.lookAt(aim,false);await hand.settled(b,signal,'combat');
   const current=b.actors.get(String(enemy.id));if(!current||signal?.aborted||this.paused||b.manualInventoryBusy||this.paOwnsHand(current)||!this.config.killaura||b.handUse||this.needsFood()||!require('./tactics').eligible(this,current)||b.entity.position.distanceTo(current.position)>this.config.range||!this.canSeeEnemy(current)||!b.name(b.items[b.quickBarSlot]).endsWith('_sword'))return false;
   b.lookAt(this.aimAtEnemy(current),false);if(b.attack(current)===false)return false;this.lastAttack=Date.now();this.attacks++;this.meleeState='剣の選択後に攻撃要求を送信';
   // Do not let the crystal loop replace the sword in the same packet batch.
   if(!hand.flush(b))await require('node:timers/promises').setTimeout(25,undefined,{signal});return true;
  }finally{hand.release(b,lease);}
 }
 paOwnsHand(enemy=this.target){return !!(this.pistonExclusive||this.crystals.piston&&this.crystals.pistonReady()&&this.crystals.active(enemy));}
 protectAnti(){return !require('./realms').isIgn(this)&&!!(this.config.anticrystal&&!this.paused&&!this.travel.route&&!this.pendingMove&&this.canFight()&&(this.target&&require('./tactics').eligible(this,this.target)||Date.now()-(this.engagedAt||0)<3000));}
 aimAtEnemy(enemy){return [1,1.6,.5].map(y=>enemy.position.offset(0,y,0)).find(point=>lineOfSight(this.bot,point))||null;}
 canSeeEnemy(enemy){return !!this.aimAtEnemy(enemy);}
 combatSword(){return this.bot.list().filter(i=>i.slot<9&&i.name.endsWith('_sword')).sort((a,b)=>equipment.rank(this.bot,b)-equipment.rank(this.bot,a))[0]||equipment.best(this.bot,'_sword');}
 canFight(){return !!(this.config.killaura||this.config.crystalaura||this.config.pistoncrystal||this.config.feettrap);}
 chooseTarget(range=this.config.jetpack?48:this.config.chaseRange){return require('./tactics').target(this,range);}
 motionTick(){
  const b=this.bot;this.telemetry.sample();this.travel.recoverAnti?.(!this.paused);
  if(!b.connected||b.ended||b.dead||this.paused||this.safety.active||!b.entity)return;
  if(this.restock.running){this.travel.stopFollowing();return;}if(this.worker.running||this.worker.startRequested||this.worker.cleanupRequested&&!this.travel.walking)return;
  if(this.travel.walking){this.travel.driveStep(this.travel.walking);return;}
  const enemy=this.canFight()&&!this.travel.route?this.chooseTarget():null;
  const healing=(this.consumeTask&&b.handUse?.kind==='food')||this.needsFood();
  if(healing&&enemy){
   this.target=enemy;
   if(Date.now()-(this.retreatAt||0)>500||!this.retreatGoal){this.retreatGoal=require('./tactics').retreat(this,enemy);this.retreatAt=Date.now();}
   if(this.retreatGoal)this.travel.follow(this.retreatGoal,this.config.eatSpeed??.12,'retreat',.5);else this.travel.stopFollowing();
   this.combatWaiting='Antiを維持・食事を優先して敵から後退';return;
  }
  if(this.paOwnsHand(enemy)){this.travel.stopFollowing();this.combatWaiting='PAを専用実行中・KAとCAを待機';return;}
  if(enemy){this.target=enemy;this.engagedAt=Date.now();if(!this.combatBusy)this.meleeTick(enemy);if(this.selfDefense.motion(enemy))return;this.travel.follow(enemy.position,Date.now()<(this.speedBlockedUntil||0)?0:this.config.chaseSpeed,'chase',this.canSeeEnemy(enemy)?this.config.range*.8:.6);}
  else if(this.travel.route&&['walk','dig'].includes(this.travel.route.mode)&&this.travel.route.dimension===b.dimensionId)return;
  else if(!this.travel.route&&this.follower.tick())return;else if(this.travel.following)this.travel.stopFollowing();
 }

 wakeEquipment(){if(this.destroyed||this.equipmentWake)return;this.equipmentWake=setTimeout(()=>{this.equipmentWake=null;this.equipmentPulse().catch(e=>this.noticeOnce('装備: '+e.message,false));},0);this.equipmentWake.unref?.();}
 async equipmentPulse(){const b=this.bot;if(this.equipmentBusy||this.destroyed||!b.connected||b.loggingOut||b.dead||b.manualInventoryBusy||b.handUse||b.urgentFoodPending||b.window||b.inventoryOpening||b.mining||b.actionHandBusy?.kind==='mining'||this.restock.running)return;this.equipmentBusy=true;
  try{await this.maintenance('オフハンド装着',()=>equipment.wear(b,{armor:false,totem:this.config.autototem}));if(this.dirty&&!this.paOwnsHand()&&!b.actionHandBusy&&!b.handUse){if(this.config.gear)await this.maintenance('防具装着',()=>equipment.wear(b,{armor:true,totem:this.config.autototem,elytra:!!this.travel.flight}));if(this.config.autoslot&&Date.now()>(this.manualSlotsUntil||0)){const complete=await equipment.autoSlots(b,undefined,{pistoncrystal:this.config.pistoncrystal});this.dirty=!complete;if(complete)this.lastSort=Date.now();}}}finally{this.equipmentBusy=false;}
 }
 notice(text,game=true){this.events.push({at:Date.now(),text:String(text).slice(0,250)});this.events=this.events.slice(-12);this.manager.notice(this.worker.id,text,{game});}
 async maintenance(name,fn,signal){this.featureErrors??={};const previous=this.featureErrors[name];if(previous?.retryAt>Date.now())return false;const oldOperation=this.operation;this.operation=name;try{await fn();delete this.featureErrors[name];return true;}catch(e){if(signal?.aborted)throw e;if(e.code==='HAND_BUSY')return false;this.featureErrors[name]={message:e.message,at:Date.now(),retryAt:Date.now()+(['Crystal/PA','Jetpack'].includes(name)?350:name==='オフハンド装着'?150:name==='AutoSlot'?250:name==='防具装着'?500:5000)};if(!this.bot.handUse)this.bot.closeContainer();this.noticeOnce(`${name}: ${e.message}。この機能を再試行します`,false);return false;}finally{if(this.operation===name)this.operation=this.busy?oldOperation:null;}}
 stop(cancelSafety=true){this.resumeCleanup=false;this.resumeMining=false;this.selfDefense.stop();this.follower.stop();this.combatAbort?.abort();this.consumeAbort?.abort();this.travel.stopFollowing();if(cancelSafety)this.safety.cancel();this.pendingMove=null;this.paused=true;this.worker.state.runtimePaused=true;this.receiving=false;this.travel.cancel(false);this.abort?.abort();this.bot.closeContainer();}
 requestMove(...args){this.resumeCleanup=false;this.resumeMining=false;require('./travel').validateGoal(...args);this.combatAbort?.abort();this.abort?.abort();this.worker.stop();this.bot.closeContainer();this.latestFeature='travel';this.follower.stop();this.selfDefense.stop();this.pendingMove=args;this.receiving=false;this.paused=false;this.worker.state.runtimePaused=false;this.retryAt=0;this.manager.store.save();this.notice('移動先を受け付けました。現在の操作を止めて移動します');}
 receive(){this.latestFeature='supply';this.worker.stop();this.stop(false);this.paused=false;this.worker.state.runtimePaused=false;this.retryAt=0;this.processedBoxes.clear();this.receiving=true;this.receivedAt=Date.now();this.dirty=true;this.notice('装備・アイテム・シュルカー受け取り待ち。アイテムは受信直後に整理し、最後の受信から3秒で待機を終了します');}
 snapshot(){return {telemetry:this.telemetry.sample(),restock:this.restock.snapshot(),autoLog:this.autoLog.snapshot(),ignActions:this.ignActions.snapshot(),followingPlayer:this.follower.snapshot(),selfDefense:this.selfDefense.snapshot(),rollbackRecovery:{antiPaused:Date.now()<(this.burrowBlockedUntil||0),speedPaused:Date.now()<(this.speedBlockedUntil||0)},busy:this.busy,operation:this.operation||null,consumption:this.bot.handUse?{...this.bot.handUse}:null,lastItemUse:this.bot.lastItemUse||null,autoSlotPending:this.dirty,lastAutoSlotVerifiedAt:this.lastSort||null,latestFeature:this.latestFeature||null,lastError:this.lastError,featureErrors:this.featureErrors||{},pendingMove:this.pendingMove||null,waterSafety:this.safety.snapshot(),crystalCombat:this.crystals.snapshot(),inventoryMode:this.bot.inventoryMode,serverAuthoritativeInventory:this.bot.serverAuthoritativeInventory,paused:this.paused,combatWaiting:this.combatWaiting,target:this.target?.name||null,attacksSent:this.attacks,totemsUsed:this.totemsUsed,receiving:this.receiving,travel:this.travel.route?{mode:this.travel.route.mode,dimension:this.travel.route.dimension,destination:this.travel.route.destination}:null,movement:this.travel.waiting,flight:!!this.travel.flight,burrowActive:!!this.travel.embed,config:this.config,offhand:this.bot.name(this.bot.offhand?.[0]),armor:(this.bot.armor||[]).map(i=>this.bot.name(i)),lastEvent:this.events.at(-1)||null};}
 async tick(){const b=this.bot,w=this.worker;if(!b.connected||b.ended||b.loggingOut||!b.entity)return;
  if(b.dead){if(w.state.respawn)b.requestRespawn();return;}
  if(await this.autoLog.check())return;this.ignActions.tick();if(w.startRequested){if(!this.busy&&!w.busy){w.controlBusy=false;try{w.start();}catch(e){w.startRequested=false;this.notice(e.message);}}return;}
  if(this.safety.update()||this.safety.active)return;
  const low=this.needsFood();
  if(!low&&this.resumeCleanup&&!this.consumeTask&&!b.handUse){this.resumeCleanup=false;w.cleanupRequested=true;w.mode='cleaning';return;}
  if(!low&&this.resumeMining&&!this.consumeTask&&!b.handUse&&!w.running){this.resumeMining=false;w.startRequested=true;return;}
  if(low&&w.running){this.resumeMining=true;w.stop();}
  if(low&&!this.paused&&b.find('enchanted_golden_apple'))this.startUse('体力回復',b.find('enchanted_golden_apple'));
  if(!low&&!this.paused&&!this.travel.route&&!this.pendingMove)await this.combatPulse();
  if(w.running||w.cleanupRequested&&!low&&!this.travel.route&&!this.travel.flight)return;if(this.busy||Date.now()<(this.retryAt||0))return;
  if(low&&w.running){this.resumeMining=true;w.stop();}
  if(w.busy)return;
  if(this.pendingMove&&(!low||!b.find('enchanted_golden_apple'))){const args=this.pendingMove;this.pendingMove=null;this.paused=false;this.travel.command(...args);}
  this.busy=true;w.controlBusy=true;this.abort=new AbortController();const signal=this.abort.signal;b.operationSignal=signal;
  try{
   if(this.travel.recoverCollision&&await this.travel.recoverCollision(signal))return;
   if(low)w.mode='healing';
   if(low&&b.find('enchanted_golden_apple')&&Date.now()-this.lastHeal>=800)this.startUse('体力回復',b.find('enchanted_golden_apple'));
   if(low&&!b.handUse&&!b.urgentFoodPending)await this.maintenance('オフハンド装着',()=>equipment.wear(b,{armor:false,totem:this.config.autototem},signal),signal);
   if(low&&b.find('enchanted_golden_apple')){w.mode='healing';if(Date.now()-this.lastHeal>=800)this.startUse('体力回復',b.find('enchanted_golden_apple'));}
   if(low&&!b.find('enchanted_golden_apple'))this.noticeOnce('回復用エンチャント金リンゴがありません。指定座標への移動は続けます');
   if(w.mode==='healing')w.mode='stopped';if(this.travel.flight?.paused==='health')this.travel.flight.paused=false;
   this.restock.scan();if(!b.handUse&&!this.travel.flight&&await this.restock.tick(signal))return;
   if(this.receiving){this.operation='装備・箱の受け取り';let handled=false;await this.maintenance('シュルカー補給',async()=>{handled=await this.receiveBox(signal);},signal);if(handled)this.dirty=true;if(Date.now()-Math.max(this.receivedAt,b.lastInventoryAt||0)>=3000){this.receiving=false;this.notice('受け取りを終了しました');}}
   const tasks=[
    ['autototem','オフハンド装着',()=>equipment.wear(b,{armor:false,totem:this.config.autototem},signal)],
    ['gear','防具装着',()=>equipment.wear(b,{armor:this.config.gear,totem:this.config.autototem,elytra:!!(this.travel.flight||this.travel.route?.mode==='fly')},signal)],
    ['autoslot','AutoSlot',async()=>{if(this.config.autoslot&&Date.now()>(this.manualSlotsUntil||0)&&(this.dirty||Date.now()-(this.lastSort||0)>5000)&&b.list().some(i=>equipment.wanted(i.name))){const complete=await equipment.autoSlots(b,signal,{pistoncrystal:this.config.pistoncrystal});this.dirty=!complete;if(complete)this.lastSort=Date.now();}}]
   ].sort((a,c)=>(this.featureOrder?.[c[0]]||0)-(this.featureOrder?.[a[0]]||0));
   for(const [,label,run]of tasks)if(!b.manualInventoryBusy&&!b.handUse&&!b.urgentFoodPending&&!(this.paOwnsHand()&&label!=='オフハンド装着'))await this.maintenance(label,run,signal);
   if(!this.paused&&!this.receiving&&w.state.autoSupply&&Date.now()-(this.lastSupplyScan||0)>3000){this.lastSupplyScan=Date.now();this.restock.scan();}
   if(this.paused)return;
   if(this.config.anticrystal&&!b.handUse&&!this.travel.route&&!this.travel.flight&&!this.travel.embed&&Date.now()>(this.burrowBlockedUntil||0))this.travel.bury(this.config.burrowDepth);
   
   const enemy=this.canFight()&&!low?this.chooseTarget():null;this.target=enemy;if(enemy)this.engagedAt=Date.now();this.combatWaiting=low?'敵から離れながら回復を優先':enemy?`敵: ${enemy.name}`:this.config.attackAll?'30ブロック以内に攻撃対象がいません':'登録した敵・援護対象が検知範囲にいません';
   if(enemy&&!this.travel.route)return;if(!this.travel.route&&this.follower.config.enabled){await this.follower.work(signal);return;}
   if(this.crystals.piston)await this.crystals.cleanup(signal);
   this.operation=this.travel.route?'座標移動':null;if(!this.config.anticrystal||this.travel.route)this.travel.unbury();b.setControlState('sneak',false);await this.travel.tick(signal);this.lastError='';
  }catch(e){if(!signal.aborted)throw e;}finally{if(b.operationSignal===signal)b.operationSignal=null;this.operation=null;this.busy=false;w.controlBusy=false;}
 }
 noticeOnce(text,game=true){if(this.lastWarning===text&&Date.now()-(this.lastWarningAt||0)<30000)return;this.lastWarning=text;this.lastWarningAt=Date.now();this.notice(text,game);}
 wakeCombat(){if(this.destroyed||this.combatWakeTimer)return;this.combatWakeTimer=setTimeout(()=>{this.combatWakeTimer=null;this.nextCombatAt=Date.now()+25;this.combatPulse().catch(e=>{if(e.code!=='HAND_BUSY'&&!this.destroyed)this.noticeOnce('戦闘: '+e.message,false);});},Math.max(0,(this.nextCombatAt||0)-Date.now()));this.combatWakeTimer.unref?.();}
 async combatPulse(){
  const b=this.bot;if(this.worker.running||this.worker.startRequested||this.worker.cleanupRequested||this.combatBusy||this.destroyed||!b.connected||b.ended||b.loggingOut||b.dead||this.paused||this.safety.active||this.travel.route||this.pendingMove||!this.canFight()||this.restock.running||this.receiving||b.manualInventoryBusy)return;
  const low=this.needsFood();
  if(low||b.handUse||this.consumeTask)return;
  const enemy=this.chooseTarget();if(!enemy)return;b.lowPriorityHandBlockedUntil=Date.now()+250;this.target=enemy;this.engagedAt=Date.now();
  if(this.worker.running)this.worker.stop();
  if(this.travel.flight&&!this.travel.flight.combat){if(!this.travel.flight.landing&&!this.travel.flight.paused)this.travel.cancel();return;}
  this.combatBusy=true;const controller=this.combatAbort=new AbortController();
  try{await this.combat(enemy,controller.signal);}catch(e){if(!controller.signal.aborted)throw e;}
  finally{this.combatBusy=false;if(this.combatAbort===controller)this.combatAbort=null;}
 }
 async combat(enemy,signal){const b=this.bot,point=enemy.position.offset(0,1,0);
  if(this.config.anticrystal&&!b.handUse&&!this.travel.embed&&!this.travel.flight?.jetpack&&!this.travel.floorEscape&&Date.now()>(this.burrowBlockedUntil||0))this.travel.bury(this.config.burrowDepth);
  const effect=b.effects.get(5);const potion=equipment.strengthPotion(b);
  if(potion&&(!effect||effect.expires<=Date.now())&&Date.now()-this.lastStrength>10000)this.startUse('力のポーション',potion);
  if(signal?.aborted||!b.actors.has(String(enemy.id))||!require('./tactics').eligible(this,enemy))return;
  if(this.consumeTask||b.handUse){this.combatWaiting='飲食しながら追尾中';return;}
  if(this.config.jetpack&&this.crystals.boost){await this.maintenance('Jetpack',()=>this.crystals.jetpackTick(enemy,signal),signal);if(this.travel.flight?.jetpack)return;}
  if(this.selfDefense.required&&!this.crystals.piston)this.selfDefense.motion(enemy);
  if((!this.selfDefense.required||require('./self-defense').protectedHole(b,this.selfDefense.pose().floored()))&&this.crystals.pistonReady()&&(this.crystals.piston||this.crystals.canPiston(enemy))){
   this.pistonExclusive=true;this.crystals.trapAbort?.abort();this.travel.stopFollowing();this.combatWaiting='PAを専用実行中・KAとCAを待機';
   try{if(this.meleeTask)await this.meleeTask;if(!signal?.aborted)await this.maintenance('Crystal/PA',()=>this.crystals.tick(enemy,signal),signal);}finally{this.pistonExclusive=false;}return;
  }
  if(this.config.jetpack&&(this.crystals.boost||b.entity.position.distanceTo(enemy.position)>8)){await this.maintenance('Jetpack',()=>this.crystals.jetpackTick(enemy,signal),signal);if(this.travel.flight?.jetpack)return;}
  const doCrystals=async()=>{if(this.config.crystalaura||this.config.pistoncrystal||this.crystals.piston)await this.maintenance('Crystal/PA',()=>this.crystals.tick(enemy,signal),signal);};
  const distance=b.entity.position.distanceTo(enemy.position);
  if(this.config.killaura&&distance<=this.config.range&&this.canSeeEnemy(enemy)){
   if(this.meleeTask)await this.meleeTask;else await this.performMelee(enemy,signal);
  }else if(this.config.killaura||this.config.crystalaura||this.config.pistoncrystal){
   this.travel.follow(enemy.position,Date.now()<(this.speedBlockedUntil||0)?0:this.config.chaseSpeed,'chase',this.canSeeEnemy(enemy)?this.config.range*.8:.6);
   if(distance<=this.config.range&&!this.canSeeEnemy(enemy))this.combatWaiting='壁を避けて敵に接近中';
  }
  if(signal?.aborted||this.consumeTask||b.handUse)return;await doCrystals();
  if((this.config.feettrap||this.selfDefense.required)&&!b.handUse&&!this.consumeTask)this.selfDefense.motion(enemy);

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
   await require('./supply-needs').takeNeeded(b,box,this.config,signal,1);
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
 destroy(){if(this.destroyed)return;this.destroyed=true;this.bot.removeListener('handAvailable',this.onHandAvailable);this.bot.removeListener('inventorySnapshot',this.onEquipment);this.bot.removeListener('totemUsed',this.onEquipment);this.autoLog.destroy();this.ignActions.destroy();this.follower.destroy();this.selfDefense.destroy();clearTimeout(this.combatWakeTimer);clearTimeout(this.equipmentWake);this.combatAbort?.abort();clearInterval(this.combatTimer);this.consumeAbort?.abort();clearInterval(this.motionTimer);this.travel.stopFollowing();this.debug.destroy();this.crystals.destroy();this.safety.cancel();clearInterval(this.timer);this.abort?.abort();this.travel.route=null;this.travel.flight=null;this.travel.embed=null;}
}
module.exports={Runtime,defaults};
