'use strict';
const {Vec3}=require('vec3');const {sleep,key,air,solid,hazard,emptyStats,addStat,canDiscard}=require('./util');
class Worker {
 constructor(manager,id,bot){this.manager=manager;this.id=id;this.bot=bot;this.state=manager.store.bot(id);this.mode='stopped';this.running=false;this.busy=false;this.receiving=false;this.lastReceive=0;this.lastEat=0;this.failed=new Map();this.missing='';this.corrections=[];this.miner=new(require('./mining').ChunkMining)(this);
  bot.on('inventory',(old,item)=>{if(item?.network_id&&(!old||item.network_id!==old.network_id||item.count>old.count)){
   this.lastReceive=Date.now();if(this.receiving){const name=bot.name(item);if(bot.registry?.blocksByName[name]){this.state.scaffold=name;this.receivedBlock=true;manager.store.save();}}
  }});
  bot.on('health',()=>{if(bot.health!==null&&bot.health<12&&bot.health>0&&this.running&&this.mode!=='healing'){bot.halt();}});
  bot.on('forcedMove',()=>{if(!this.running&&!this.cleanupRequested)return;const now=Date.now();this.corrections=this.corrections.filter(t=>now-t<10000);this.corrections.push(now);this.abort?.abort();this.bot.halt();this.runtime?.travel.stopFollowing();this.miningRetryAt=now+Math.min(3500,300+this.corrections.length*250);this.miningPhase='repath';this.missing='サーバーの補正位置から経路を再確認中';if(this.corrections.length>=5&&now-(this.lastCorrectionNotice||0)>10000){this.lastCorrectionNotice=now;this.notice('位置補正が続いたため少し待って経路を再探索します');}});
  bot.on('death',()=>{this.mode='dead';this.running=false;this.notice('死亡しました。装備の補給待ちです');});
  bot.on('respawnReady',()=>{if(this.state.respawn){try{bot.respawn();this.mode='waiting';this.missing='死亡後の装備';}catch(e){this.notice(e.message);}}});
  this.timer=setInterval(()=>this.tick().catch(e=>{this.stop();this.notice(e.message);}),300);
  if(bot.client)this.runtime=new (require('./runtime').Runtime)(this);
 }
 notice(text){this.manager.notice(this.id,text);}
 stop(){this.startRequested=false;this.cleanupRequested=false;this.running=false;this.receiving=false;this.receivedBlock=false;this.mode='stopped';this.bot.halt();this.abort?.abort();}
 requestCleanup(){this.stop();this.cleanupRequested=true;this.mode='cleaning';if(this.runtime){this.runtime.paused=false;this.state.runtimePaused=false;this.runtime.latestFeature='cleanup';this.runtime.follower?.stop();this.runtime.travel.cancel(false);}return '自分で置いた足場を安全な順に回収します';}
 start(){if(!this.state.area||!Number.isInteger(this.state.floor))throw Error('area と floor を先に指定してください');if(this.bot.terrainReady===false)throw Error('Botの足元の地形をまだ受信していません。messagesでサーバー案内を確認してください');if(!this.bot.connected||this.bot.dead)throw Error('Botが接続していません');if(this.state.supplyPending||this.state.autoBox)throw Error('補給途中の箱があります。recover / autoslot receive を実行してください');if(this.busy||this.controlBusy){this.startRequested=true;return false;}this.startRequested=false;this.cleanupRequested=false;this.miningRetryAt=0;this.miningPhase='scan';if(this.runtime){this.runtime.paused=false;this.runtime.worker.state.runtimePaused=false;this.runtime.latestFeature='mining';this.runtime.follower.stop();this.runtime.travel.cancel(false);}this.miner.reset();this.bot.naturalIdleFall=false;this.bot.passivePhysics=false;this.running=true;this.mode='running';this.missing='';return true;}
 receive(){this.stop();this.receiving=true;this.mode='receiving';this.lastReceive=0;this.receivedBlock=false;this.notice('足場ブロックを渡してください。最後の受け取りから3秒後に再開します');}
 inArea(p){const a=this.state.area;return a&&p.x>=a.x1&&p.x<=a.x2&&p.z>=a.z1&&p.z<=a.z2&&p.y>this.state.floor&&p.y<=this.state.ceiling;}
 owned(p){return this.state.owned[`${this.bot.dimensionId}:${key(p)}`];}
 recordOwned(p,kind,name){this.state.owned[`${this.bot.dimensionId}:${key(p)}`]={p:{x:p.x,y:p.y,z:p.z},kind,name,dimension:this.bot.dimensionId,placedAt:Date.now()};if(kind==='scaffold')this.state.scaffoldCleanupPending=true;this.manager.store.save();}
 removeOwned(p){delete this.state.owned[`${this.bot.dimensionId}:${key(p)}`];this.manager.store.save();}
 underPlayer(p,{ignoreSelf=false}={}){return [...this.manager.workers.values()].some(w=>{const q=w.bot.entity?.position;return (!ignoreSelf||w!==this)&&(w===this||w.bot.connected)&&!w.bot.dead&&require('./mining').sameWorld(this,w)&&q&&Math.abs(q.x-(p.x+.5))<.8&&Math.abs(q.z-(p.z+.5))<.8&&q.y>=p.y&&q.y<=p.y+2;});}
 canDropThrough(block){const b=this.bot,p=block.position,q=b.entity.position;if(this.underPlayer(p,{ignoreSelf:true})||Math.abs(q.x-p.x-.5)>=.8||Math.abs(q.z-p.z-.5)>=.8||q.y<p.y||q.y>p.y+2||b.entity.onGround===false)return false;
  const {dropLanding}=require('./navigation'),view={blockAt:at=>key(at)===key(p)?{name:'air',isAir:true,solid:false,shapes:[],position:p}:b.blockAt(at)};
  return !!dropLanding(view,p.offset(0,1,0),this.runtime?.travel.dropLimit?.()??64);
 }
 async tick(){if(this.busy||this.controlBusy||this.bot.handUse||this.runtime?.consumeTask||this.runtime?.equipmentBusy||!this.bot.connected||this.bot.dead||Date.now()<(this.miningRetryAt||0))return;
  if(this.receiving){if(this.receivedBlock&&this.lastReceive&&Date.now()-this.lastReceive>=3000){this.receiving=false;try{this.start();this.notice(`足場 ${this.state.scaffold} で再開しました`);}catch(e){this.mode='stopped';this.notice(e.message);}}return;}
  if(!this.running&&!this.cleanupRequested&&this.mode!=='waiting')return;
  this.busy=true;this.abort=new AbortController();const signal=this.abort.signal;
  try {
   if(this.bot.health===null){this.mode='waiting_health';return;}
   if(!this.runtime&&this.bot.health<12){this.mode='healing';if(!this.bot.find('enchanted_golden_apple'))return this.wait('エンチャント金リンゴ');
    if(Date.now()-this.lastEat>=5000){await this.bot.eat(signal);this.lastEat=Date.now();}return;}
   const missing=!this.bot.tool()?'ピッケル':null;
   if(missing){if(this.state.autoSupply&&this.runtime){this.runtime.restock.request(missing+'が不足');this.wait(missing);}else this.wait(missing);return;}
   if(this.mode==='waiting'){if(!this.lastReceive||Date.now()-this.lastReceive<3000)return;this.bot.naturalIdleFall=false;this.bot.passivePhysics=false;this.running=true;this.mode='running';this.missing='';this.notice('補給を確認しました。再開します');}
   if(this.cleanupRequested){this.mode='cleaning';const result=await this.cleanup(signal,{finish:true});if(!result.remaining){this.stop();this.notice('採掘・不要な足場の回収が完了しました');}else{this.missing=result.reason;this.miningPhase='cleanup';if(!result.progress&&(this.lastCleanupNotice!==result.reason||Date.now()-(this.lastCleanupNoticeAt||0)>15000)){this.lastCleanupNotice=result.reason;this.lastCleanupNoticeAt=Date.now();this.notice(result.reason);}}return;}
   if(!this.running)return;this.mode='running';if(this.runtime?.needsFood?.()){this.runtime.startUse('体力回復',this.bot.find('enchanted_golden_apple'));return;}if(this.runtime?.travel.recoverCollision&&await this.runtime.travel.recoverCollision(signal))return;
   if(this.bot.entity.onGround===false&&!solid(this.bot.blockAt(this.bot.entity.position.offset(0,-.1,0)))&&!require('./navigation').water(this.bot.blockAt(this.bot.entity.position))){this.miningPhase='falling';this.missing='下段へ落下中・着地してから採掘します';return;}
   await this.discard(signal);
   const target=this.chooseTarget();this.miningTarget=target?{name:target.name,position:{...target.position}}:null;if(!target){await this.explore(signal);return;}
   const reservation=`${this.bot.dimensionId}:${key(target.position)}`;if(this.manager.claims.has(reservation))return;this.manager.claims.set(reservation,this.id);
   try{if(this.bot.reach(target)&&this.bot.visible(target)){this.miningPhase='dig';this.miningApproach=null;this.approachPlan=null;if(this.runtime)this.runtime.travel.groundPlan=null;await this.bot.dig(target,signal);if(signal.aborted)return;this.missing='';this.miningPhase='confirmed';
      if(!this.owned(target.position)){addStat(this.state.stats,target.name);addStat(this.state.session,target.name);this.recordMined(target.name);this.manager.store.save();}
      await this.cleanup(signal);
     }else await this.approach(target,signal);
   }catch(e){if(signal.aborted)return;if(this.bot.health<12)return;this.miningPhase='retry';this.failed.set(key(target.position),Date.now()+(e.code==='PATH_WAIT'?8000:3000));this.approachPlan=null;this.missing=e.message;if(this.lastMiningNotice!==e.message||Date.now()-(this.lastMiningNoticeAt||0)>10000){this.lastMiningNotice=e.message;this.lastMiningNoticeAt=Date.now();this.manager.notice(this.id,'採掘経路を再確認: '+e.message,{game:false});}return;}finally{this.manager.claims.delete(reservation);}
  }catch(e){if(!signal.aborted&&this.running&&this.bot.health>=12){this.stop();this.notice(e.message);}}finally{this.busy=false;}
 }
 recordMined(name){const drop={stone:'cobblestone',deepslate:'cobbled_deepslate',grass_block:'dirt',snow:'snowball',redstone_ore:'redstone',coal_ore:'coal',diamond_ore:'diamond',emerald_ore:'emerald',lapis_ore:'lapis_lazuli',nether_quartz_ore:'quartz',glowstone:'glowstone_dust',glass:null};
  for(const n of [name,drop[name]])if(n&&!this.state.minedItems.includes(n))this.state.minedItems.push(n);}
 wait(missing){this.mode='waiting';this.running=false;if(this.missing!==missing){this.missing=missing;this.lastReceive=0;this.notice(`${missing}がなくなりました。補給待ちです`);}}
 chooseTarget(){
  const candidate=this.miner.scan(),held=this.miningTarget,plan=this.approachPlan;if(!held||!plan||this.miner.surveying||held.position.y!==this.miner.layer)return candidate;
  const p=new Vec3(held.position.x,held.position.y,held.position.z),block=this.bot.blockAt(p),reservation=`${this.bot.dimensionId}:${key(p)}`;
  // Keep the actual target as well as its stance. Otherwise the nearest-block
  // sort could switch targets after every step and undo the stable route.
  if(plan.targetKey===reservation&&block&&!air(block)&&block.diggable&&block.name===held.name&&this.inArea(p)&&require('./mining').wanted(this,block)&&!this.owned(p)&&(!this.underPlayer(p)||this.canDropThrough(block))&&(this.failed.get(key(p))||0)<=Date.now()&&!this.manager.claims.has(reservation))return block;
  return candidate;
 }
 miningStatus(){return {...this.miner.snapshot(),phase:this.miningPhase||null,target:this.miningTarget||null,approach:this.miningApproach||null,missing:this.missing||'',dig:this.bot.digState||null,recovery:this.runtime?.travel.collisionRecovery||null,scaffolds:this.scaffoldCleanup||null,retryAt:this.miningRetryAt||null};}
 async approach(target,signal){if(this.runtime){
   const b=this.bot,travel=this.runtime.travel,navigation=require('./navigation'),stock=this.state.scaffoldEnabled!==false&&(b.list().find(i=>i.name===this.state.scaffold)||b.list().find(i=>['cobblestone','stone','dirt','obsidian','slime','slime_block'].includes(i.name)));this.miningPhase='approach';travel.waiting='ブロックの隣の採掘位置へ接近';
   const targetKey=`${b.dimensionId}:${key(target.position)}`,previous=this.approachPlan;let best=null;
   if(previous?.targetKey===targetKey&&navigation.pass(b,previous.goal.floored())){const distance=b.entity.position.distanceTo(previous.goal);if(distance<(previous.remaining??Infinity)-.3){previous.remaining=distance;previous.progressAt=Date.now();}if(Date.now()-(previous.progressAt||previous.at)<12000)best=previous;else throw Object.assign(Error('採掘位置への移動が進まないため、この対象を一旦譲って別のブロックを探します'),{code:'PATH_WAIT'});}
   let spots=[],detour=null;
   // Search real ground for every stance first. A cheap floating stance must
   // not win just because a carried stack makes placement possible.
   for(const allowScaffold of stock?[false,true]:[false]){if(best)break;spots=require('./mining').stands(this,target,{allowScaffold});const began=performance.now();let searched=0;
    for(const goal of spots.slice(0,24)){if(signal?.aborted)throw Error('停止しました');if(searched++%3===2)await new Promise(resolve=>setImmediate(resolve));if(best&&performance.now()-began>35)break;const path=navigation.groundPath(b,b.entity.position,goal,travel.groundOptions({dig:true,block:allowScaffold?stock:null,limit:900}));if(!path.reached)continue;const score=path.cost+(solid(b.blockAt(goal.offset(0,-1,0)))?0:5);const choice={goal,score,targetKey,at:Date.now(),progressAt:Date.now(),remaining:b.entity.position.distanceTo(goal),placements:path.placements};if(!allowScaffold&&stock&&score>Math.hypot(goal.x-b.entity.position.x,goal.z-b.entity.position.z)*1.8+Math.max(0,b.entity.position.y-goal.y)*.03+4){if(!detour||score<detour.score)detour=choice;continue;}if(!best||score<best.score)best=choice;if(score<=1)break;}
   }
   if(!best)best=detour;
   if(!best)throw Object.assign(Error(spots.length?'指定ブロックへ届く経路を再探索中。別の対象も確認します':'指定ブロックを掘れる立ち位置がありません。範囲・床・天井を確認してください'),{code:'PATH_WAIT'});
   this.approachPlan=best;this.miningApproach={position:{...best.goal},target:{...target.position}};this.missing='';try{await travel.walk(best.goal,'dig',signal,{until:()=>b.reach(target)&&b.visible(target)});}catch(e){this.approachPlan=null;travel.groundPlan=null;throw e;}return;
  }const t=target.position,p=this.bot.entity.position;const spots=[];
  for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++)for(let dy=-1;dy<=1;dy++){const q=new Vec3(t.x+dx,Math.floor(p.y)+dy,t.z+dz);if(air(this.bot.blockAt(q))&&air(this.bot.blockAt(q.offset(0,1,0)))&&solid(this.bot.blockAt(q.offset(0,-1,0))))spots.push(q);}
  spots.sort((a,b)=>p.distanceTo(a)-p.distanceTo(b));for(const spot of spots.slice(0,3)){try{await this.bot.go(spot,signal);if(this.bot.reach(target))return;}catch(e){if(signal.aborted||this.bot.health<12)throw e;}}
  await this.buildStep(t,signal);
 }
 async placeOwned(pos,item,kind,signal,options){
  if(kind==='scaffold'&&this.state.scaffoldEnabled===false)throw Object.assign(Error('足場の自動設置はOFFです'),{code:'PATH_WAIT'});
  const b=this.bot,dimension=b.dimensionId,k=`${dimension}:${key(pos)}`,began=Date.now();if(this.manager.claims.has(k))throw Error('他のBotがこの場所を操作中です');this.manager.claims.set(k,this.id);
  try{await b.place(pos,item,signal,options);this.recordOwned(pos,kind,item.name);}finally{
   this.manager.claims.delete(k);const sent=b.lastPlacement;if(kind==='scaffold'&&!this.state.owned[k]&&sent?.sentAt>=began&&sent.name===item?.name&&sent.dimension===dimension&&key(sent.position)===key(pos)){
    // A cancellation or a slow acknowledgement must not orphan the block.
    // Only claim a matching echo of this placement in the same live world.
    const generation=b.worldGeneration;let timer;const clean=()=>{clearTimeout(timer);b.removeListener('worldUpdate',echo);b.removeListener('end',clean);},echo=p=>{if(b.dimensionId!==dimension||b.worldGeneration!==generation){clean();return;}if(key(p)===key(pos)&&b.blockAt(pos)?.name===item.name){this.recordOwned(pos,kind,item.name);clean();}};
    b.on('worldUpdate',echo);b.once('end',clean);timer=setTimeout(clean,30000);timer.unref?.();echo(pos);
   }
  }
 }

 async buildStep(target,signal){if(this.state.scaffoldEnabled===false)throw Object.assign(Error('足場の自動設置はOFFです'),{code:'PATH_WAIT'});const p=this.bot.entity.position;const feet=new Vec3(Math.floor(p.x),Math.round(p.y),Math.floor(p.z));
  const dirs=[[1,0],[-1,0],[0,1],[0,-1]].sort((a,b)=>Math.hypot(feet.x+a[0]-target.x,feet.z+a[1]-target.z)-Math.hypot(feet.x+b[0]-target.x,feet.z+b[1]-target.z));
  const rise=target.y>feet.y+2?1:0;
  for(const[dx,dz]of dirs){const place=feet.offset(dx,rise-1,dz),stand=place.offset(0,1,0);if(!air(this.bot.blockAt(place))||!air(this.bot.blockAt(stand))||!air(this.bot.blockAt(stand.offset(0,1,0))))continue;
   const item=this.bot.find(this.state.scaffold);if(!item)throw Error('足場ブロックがなくなりました');if(rise===1&&!solid(this.bot.blockAt(place.offset(0,-1,0)))){const lower=place.offset(0,-1,0);if(!air(this.bot.blockAt(lower)))continue;await this.placeOwned(lower,item,'scaffold',signal);}
   await this.placeOwned(place,this.bot.find(this.state.scaffold),'scaffold',signal);await this.bot.go(stand,signal);return;
  }throw Error('進める経路・足場の設置場所がありません。場所を移して再開してください');
 }
 async explore(signal){
  if(this.miner.done){this.cleanupRequested=true;this.mode='cleaning';this.miningPhase='cleanup';this.missing='採掘完了。置いた足場を回収中';return;}
  if(this.miner.supportBlocks?.length&&await this.leaveMiningSupport(signal))return;
  this.miningPhase='scan';this.missing=this.miner.state;const goal=this.miner.goal();if(!goal||goal.distanceTo(this.bot.entity.position)<2)return;
  try{if(this.runtime)await this.runtime.travel.walk(goal,'dig',signal,{allowScaffold:false});else await this.bot.go(goal.floored(),signal);}catch(e){if(signal.aborted)throw e;this.miningRetryAt=Date.now()+1500;this.missing=this.miner.state+' / '+e.message;this.manager.notice(this.id,this.missing,{game:false});}
 }
 async leaveMiningSupport(signal){
  const b=this.bot,p=b.entity.position,travel=this.runtime?.travel;if(!travel||!this.miner.supportBlocks.some(q=>Math.abs(q.x+.5-p.x)<.9&&Math.abs(q.z+.5-p.z)<.9&&p.y>=q.y&&p.y<=q.y+2))return false;
  const navigation=require('./navigation'),base=p.floored(),goals=[];for(let dx=-3;dx<=3;dx++)for(let dz=-3;dz<=3;dz++)for(const dy of [-1,0,1]){
   const q=base.offset(dx,dy,dz),stand=q.offset(.5,0,.5),support=q.offset(0,-1,0);if(stand.distanceTo(p)<.6||!solid(b.blockAt(support))||!navigation.pass(b,q))continue;
   if(support.y>=this.miner.layer&&this.inArea(support)&&!this.owned(support)&&require('./mining').wanted(this,b.blockAt(support)))continue;
   const path=navigation.groundPath(b,p,stand,{limit:350,blocked:(a,c)=>travel.edgeBlocked(a,c)});if(path.length&&path.at(-1).position.offset(.5,0,.5).distanceTo(stand)<.25)goals.push({stand,cost:path.length+Math.abs(dy)*.1});
  }
  goals.sort((a,c)=>a.cost-c.cost);if(!goals.length){this.missing='自分の足元を残しています。隣の低い足場・範囲外の安全な地面を確認中';return false;}
  this.miningPhase='reposition';this.missing='自分の足元を掘るため安全な地面へ移動';try{await travel.walk(goals[0].stand,'walk',signal,{allowScaffold:false});}catch(e){if(signal.aborted)throw e;this.missing=e.message;}return true;
 }
 async cleanup(signal,options){return require('./scaffolds').step(this,signal,options);}
 async discard(signal){const sums=new Map();for(const i of this.bot.list())if(this.state.minedItems.includes(i.name)&&canDiscard(i.name,this.state.scaffold))sums.set(i.name,(sums.get(i.name)||0)+i.count);
  for(const[name,count]of sums){const limit=this.bot.registry.itemsByName[name]?.stackSize||64;if(count<limit)continue;let left=limit;for(const i of this.bot.list().filter(i=>i.name===name)){if(signal.aborted)return;const n=Math.min(left,i.count);await this.bot.drop(i.slot,n);left-=n;if(!left)break;}}
 }
 supplySpot(exclude){const p=this.bot.entity.position;for(const[dx,dz]of [[1,0],[-1,0],[0,1],[0,-1],[2,0],[0,2],[-2,0],[0,-2]]){const q=new Vec3(Math.floor(p.x)+dx,Math.floor(p.y),Math.floor(p.z)+dz);if(exclude&&key(q)===key(exclude))continue;if(air(this.bot.blockAt(q))&&air(this.bot.blockAt(q.offset(0,1,0)))&&solid(this.bot.blockAt(q.offset(0,-1,0))))return q;}throw Error('補給用チェストを置く場所がありません');}
 wanted(name){return name===this.state.scaffold||require('./equipment').wanted(name);}
 async takeSupplies(window,signal){let taken=0;for(let slot=0;slot<window.items.length;slot++){const raw=window.items[slot];if(!raw||!this.wanted(this.bot.name(raw)))continue;if(this.bot.items.filter(i=>!i).length<=2)break;const dest=this.bot.items.findIndex(i=>!i);if(dest<0)break;if(signal.aborted)throw Error('停止');await this.bot.transfer(true,slot,false,dest);taken++;}return taken;}
 async supply(signal){this.mode='supplying';const tool=this.bot.tool(true);if(!tool)throw Error('エンダーチェスト回収用のシルクタッチ付きピッケルが必要です');
  if(this.bot.items.filter(i=>!i).length<3)throw Error('自動補給にはインベントリの空き3枠が必要です');
  const chestPos=this.supplySpot();await this.placeOwned(chestPos,this.bot.find('ender_chest'),'ender_chest',signal);this.state.supplyPending={chest:{x:chestPos.x,y:chestPos.y,z:chestPos.z},box:null};this.manager.store.save();
  try{let chest=await this.bot.openContainer(chestPos,signal);await this.takeSupplies(chest,signal);
   for(let slot=0;slot<chest.items.length;slot++){
    const raw=chest.items[slot];if(!raw||!/shulker_box$/.test(this.bot.name(raw)))continue;
    const empty=this.bot.items.findIndex(i=>!i);if(empty<0)break;const boxName=this.bot.name(raw);await this.bot.transfer(true,slot,false,empty);this.bot.closeContainer();
    const boxPos=this.supplySpot(chestPos);this.state.supplyPending.box={x:boxPos.x,y:boxPos.y,z:boxPos.z,name:boxName};this.manager.store.save();await this.placeOwned(boxPos,this.bot.find(boxName),'shulker',signal);
    const box=await this.bot.openContainer(boxPos,signal);if(box.items.length!==27)throw Error('シュルカーの27枠を確認できません');await this.takeSupplies(box,signal);const isEmpty=box.items.every(i=>!i||!i.network_id);this.bot.closeContainer();await this.recoverBox(boxPos,boxName,isEmpty,chestPos,signal);
    chest=await this.bot.openContainer(chestPos,signal);
    if(this.bot.tool()&&this.bot.find('enchanted_golden_apple')&&this.bot.find(this.state.scaffold))break;
   }this.bot.closeContainer();await this.recoverChest(chestPos,signal);this.state.supplyPending=null;this.manager.store.save();
   if(!this.bot.tool()||!this.bot.find('enchanted_golden_apple')||!this.bot.find(this.state.scaffold))this.wait('必要な補給品');else{this.mode='running';this.notice('エンダーチェストから補給しました');}
  }finally{this.bot.closeContainer();}
 }
 async collectPlaced(pos,name,signal,tool){const count=this.bot.count(name);const previousIds=new Set(this.bot.list().filter(i=>i.name===name).map(i=>i.raw.stack_id));const b=this.bot.blockAt(pos);await this.bot.dig(b,signal,tool);this.removeOwned(pos);
  const walk=new Vec3(pos.x,Math.floor(this.bot.entity.position.y),pos.z);if(air(this.bot.blockAt(walk))&&solid(this.bot.blockAt(walk.offset(0,-1,0))))await this.bot.go(walk,signal);
  await this.bot.waitUntil(()=>this.bot.count(name)>count,6000,signal);const received=this.bot.list().find(i=>i.name===name&&!previousIds.has(i.raw.stack_id));if(!received)throw Error('回収した箱の識別ができません。保持して停止します');return received;
 }
 async recoverBox(pos,name,isEmpty,chestPos,signal){this.state.supplyPending.box={...this.state.supplyPending.box,empty:isEmpty,phase:'recovering'};this.manager.store.save();const item=await this.collectPlaced(pos,name,signal);this.state.supplyPending.box={...this.state.supplyPending.box,phase:'carried',stackId:item.raw.stack_id};this.manager.store.save();if(!item)throw Error('シュルカーを回収できません');if(isEmpty)await this.bot.drop(item.slot,1);else{
   const chest=await this.bot.openContainer(chestPos,signal);const dest=chest.items.findIndex(i=>!i);if(dest<0)throw Error('エンダーチェストに空きがありません。中身入りシュルカーを保持して停止します');await this.bot.transfer(false,item.slot,true,dest,1);this.bot.closeContainer();
  }this.state.supplyPending.box=null;this.manager.store.save();}
 async recoverChest(pos,signal){const tool=this.bot.tool(true);if(!tool)throw Error('シルクタッチのピッケルを補給してください');await this.collectPlaced(pos,'ender_chest',signal,tool);}
 async recover(){if(this.busy)throw Error('操作完了まで待ってください');const pending=this.state.supplyPending;if(!pending)throw Error('補給途中の箱はありません');this.busy=true;this.abort=new AbortController();const signal=this.abort.signal;
  try{const cp=new Vec3(pending.chest.x,pending.chest.y,pending.chest.z);if(pending.box?.phase==='carried'){const item=this.bot.list().find(i=>i.raw.stack_id===pending.box.stackId&&i.name===pending.box.name);if(!item)throw Error('保持したシュルカーが見つかりません。手動確認が必要です');if(pending.box.empty)await this.bot.drop(item.slot,1);else{const chest=await this.bot.openContainer(cp,signal);const dest=chest.items.findIndex(i=>!i);if(dest<0)throw Error('エンダーチェストに空きがありません');await this.bot.transfer(false,item.slot,true,dest,1);this.bot.closeContainer();}pending.box=null;this.manager.store.save();}
   if(pending.box){const q=new Vec3(pending.box.x,pending.box.y,pending.box.z);const b=this.bot.blockAt(q);if(b&&!air(b)){const w=await this.bot.openContainer(q,signal);if(w.items.length!==27)throw Error('シュルカーの内容未確認');const empty=w.items.every(i=>!i);this.bot.closeContainer();await this.recoverBox(q,pending.box.name,empty,cp,signal);}else throw Error('箱の状態が変わりました。手動で回収し、Discordのclear-recoveryを使ってください');}
   await this.recoverChest(cp,signal);this.state.supplyPending=null;this.manager.store.save();this.mode='stopped';return '補給用の箱を回収しました。startで再開できます';
  }finally{this.busy=false;this.bot.closeContainer();}}
 destroy(){this.miner?.destroy();this.runtime?.destroy();this.stop();clearInterval(this.timer);this.bot.disconnect();}
 status(){return {version:require('../package.json').version,bps:this.runtime?.telemetry?.sample().bps??0,number:this.id,name:this.bot.username,mode:this.mode,mining:this.miningStatus(),connectionPhase:this.bot.connectionPhase,endpoint:{host:this.bot.config?.host,port:this.bot.config?.port},terrainReady:this.bot.terrainReady,inventoryMode:this.bot.inventoryMode,serverAuthoritativeInventory:this.bot.serverAuthoritativeInventory,inventoryOpenState:this.bot.inventoryOpenState,lastInventoryOperation:this.bot.lastStackResponse,waterSafety:this.runtime?.safety?.snapshot(),passivePhysics:this.bot.passivePhysics,naturalIdleFall:this.bot.naturalIdleFall,serverPosition:this.bot.serverPosition,positionCorrections:this.bot.positionCorrections||0,positionNormalization:this.bot.lastPositionNormalization,collisionState:this.bot.collisionState,packets:this.bot.packetCounts,lastDisconnect:this.bot.lastDisconnect,position:this.bot.entity?.position,health:this.bot.health===null?null:this.bot.health/2,missing:this.missing,scaffold:this.state.scaffold,scaffoldEnabled:this.state.scaffoldEnabled!==false,stats:this.state.stats,session:this.state.session,ownedScaffolds:Object.values(this.state.owned).filter(o=>o.kind==='scaffold').length};}
}
module.exports={Worker};
