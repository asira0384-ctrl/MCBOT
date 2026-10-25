'use strict';
const {Vec3}=require('vec3');const {air,solid,hazard}=require('./util');const {wear}=require('./equipment');
const dimensions={overworld:0,nether:1,end:2,現世:0,ネザー:1,エンド:2};
function dimension(value){if(Object.hasOwn(dimensions,value))return dimensions[value];const n=Number(value);if(Number.isInteger(n)&&n>=0&&n<=2)return n;throw Error('ディメンション: overworld / nether / end');}
function validateGoal(mode,dim,x,y,z){if(!['walk','dig','fly','jetpack'].includes(mode))throw Error('移動方法: walk / dig / fly / jetpack');const destination=new Vec3(...[x,y,z].map(Number));if(![destination.x,destination.y,destination.z].every(Number.isFinite)||Math.abs(destination.x)>30000000||Math.abs(destination.z)>30000000||destination.y< -64||destination.y>319)throw Error('座標の範囲が不正です');return {mode,dimension:dimension(dim),destination};}
function bodyClear(bot,p,margin=.3){const verticalGap=Math.max(0,margin-.3);for(let x=Math.floor(p.x-margin+1e-7);x<=Math.floor(p.x+margin-1e-7);x++)for(let z=Math.floor(p.z-margin+1e-7);z<=Math.floor(p.z+margin-1e-7);z++)for(let y=Math.floor(p.y-verticalGap+1e-7);y<=Math.floor(p.y+1.79+verticalGap);y++){const b=bot.blockAt({x,y,z});if(!b||b.solid||b.isLiquid||/unknown|fire|lava/.test(b.name))return false;}return true;}
function sweptClear(bot,from,to,margin=.3){const delta=to.minus(from),n=Math.max(1,Math.ceil(delta.norm()*5));for(let i=0;i<=n;i++)if(!bodyClear(bot,from.plus(delta.scaled(i/n)),margin))return false;return true;}
function wallDistance(bot,p){let best=Infinity;for(let x=Math.floor(p.x)-2;x<=Math.floor(p.x)+2;x++)for(let z=Math.floor(p.z)-2;z<=Math.floor(p.z)+2;z++)for(let y=Math.floor(p.y)-2;y<=Math.floor(p.y)+3;y++){const b=bot.blockAt({x,y,z});if(b&&!b.solid&&b.name!=='unknown'&&!b.isLiquid)continue;const dx=Math.max(x-(p.x+.3),p.x-.3-x-1,0),dz=Math.max(z-(p.z+.3),p.z-.3-z-1,0),dy=Math.max(y-(p.y+1.8),p.y-y-1,0);best=Math.min(best,Math.hypot(dx,dy,dz));}return best;}
function landingFloor(bot,p,max=10){for(let d=0;d<=max;d++){const y=Math.floor(p.y)-d,q=new Vec3(Math.floor(p.x),y,Math.floor(p.z));if(solid(bot.blockAt(q.offset(0,-1,0)))&&bodyClear(bot,q.offset(.5,0,.5)))return q.offset(.5,0,.5);}return null;}
function nearestPortal(bot,toDimension){if(bot.dimensionId===2||toDimension===2)throw Error('自動探索は現世とネザーのポータルに対応します');const p=bot.entity.position;let best=null,dist=Infinity;
 for(const [id]of bot.worldMirror.columns){const [cx,cz]=id.split(',').map(Number);if(Math.abs(cx*16-p.x)>48||Math.abs(cz*16-p.z)>48)continue;
  for(let x=cx*16;x<cx*16+16;x++)for(let z=cz*16;z<cz*16+16;z++)for(let y=Math.max(bot.dimensionId===1?0:-64,Math.floor(p.y)-16);y<=Math.floor(p.y)+16;y++){const q=new Vec3(x,y,z),b=bot.blockAt(q);if(b&&/^(portal|nether_portal)$/.test(b.name)&&p.distanceTo(q)<dist&&solid(bot.blockAt(q.offset(0,-1,0)))){best=q;dist=p.distanceTo(q);}}
 }return best;
}
class Travel{
 constructor(runtime){this.runtime=runtime;this.bot=runtime.bot;this.route=null;this.flight=null;this.embed=null;this.waiting='';
  this.bot.motion=this;const clearAnchor=()=>{this.groundPlan=null;this.antiRecovery=null;this.antiAnchor=null;this.floorEscape=null;this.embed=null;};this.bot.on('death',clearAnchor);this.bot.on('dimensionChanged',()=>{clearAnchor();this.bot.straightTimerActive=false;this.flight=null;if(this.route){this.route.portal=null;this.route.enteredAt=0;this.waiting='新しい地形の受信待ち';}});
 }
 command(mode,dim,x,y,z){const goal=validateGoal(mode,dim,x,y,z);this.cancel(false);this.route={...goal,portal:null,enteredAt:0};this.waiting='移動準備';}
 glide(on){if(this.bot.gliding===on)return;this.bot.gliding=on;this.bot.pendingGlide=on?'start':'stop';this.bot.client.queue('player_action',{runtime_entity_id:BigInt(this.bot._runtimeEntityId),action:on?'start_glide':'stop_glide',position:{x:0,y:0,z:0},result_position:{x:0,y:0,z:0},face:0});}
 cancel(land=true,{preserveAnti=false}={}){this.groundPlan=null;this.floorEscape=null;this.bot.straightTimerActive=false;this.stopFollowing();this.bot.clearControlStates?.();this.bot.controlState.forward=false;this.route=null;if(!preserveAnti)this.unbury();this.waiting='';if(this.flight&&land){const floor=landingFloor(this.bot,this.bot.entity.position,16);if(floor){this.flight={goal:floor,landing:true};this.waiting='着地中';return;}this.flight={goal:this.bot.entity.position.clone(),paused:true};this.waiting='着地点が未受信・飛行待機';return;}this.flight=null;if(this.bot.gliding)this.glide(false);}
 rollback(){
  this.groundPlan=null;this.floorEscape=null;this.bot.straightTimerActive=false;const now=Date.now();this.recentCorrections=(this.recentCorrections||[]).filter(t=>now-t<6000);this.recentCorrections.push(now);this.corrections=(this.corrections||0)+1;this.flightSlowUntil=now+5000;
  const protectedAnti=this.runtime.protectAnti?.(),duration=protectedAnti?300:this.recentCorrections.length>=3?5000:1500;this.runtime.speedBlockedUntil=now+duration;if(!protectedAnti)this.runtime.burrowBlockedUntil=now+duration+300;
  if(this.embed)this.rememberAnti();
  if(this.antiAnchor&&now-this.antiAnchor.at<30000)this.antiRecovery={...this.antiAnchor,at:now};
  this.embed=null;if(protectedAnti){this.antiRecovery=null;this.runtime.burrowBlockedUntil=0;this.adoptCombatAnti();}this.bot.desiredMoveSpeed=undefined;this.bot.clearControlStates?.();if(this.following){this.following.path=null;this.following.plannedAt=0;}
  if(this.flight?.jetpack||this.flight?.gap){this.flight=null;this.bot.controlState.forward=false;this.glide(false);this.waiting='位置補正を受けて追尾飛行を終了';return;}
  if(this.flight){this.flight.path=null;this.flight.paused='replan';this.flight.retryAt=Date.now()+Math.min(4000,500+this.corrections*100);this.waiting='位置補正後に減速して迂回経路を再探索';}
 }
 gapGoal(destination){
  if(this.runtime.protectAnti?.())return null;
  const b=this.bot,p=this.embed?new Vec3(b.entity.position.x,this.embed.original,b.entity.position.z):b.entity.position,delta=destination.minus(p),length=Math.hypot(delta.x,delta.z);if(length<2||b.name?.(b.armor?.[1])!=='elytra'||Math.abs(delta.y)>1.5)return null;
  let gap=false;for(let d=.5;d<=Math.min(5,length);d+=.5){const q=p.offset(delta.x/length*d,0,delta.z/length*d),floor=b.blockAt(q.offset(0,-.1,0));
   if(!bodyClear(b,q,.3)||!floor||floor.name==='unknown'||floor.isLiquid)return null;
   if(!solid(floor))gap=true;
   else if(gap){if(d>4.5)return null;return q;}
  }return null;
 }

 follow(destination,speed,kind='chase',stopRadius=.7){
  const b=this.bot,pose=this.embed?new Vec3(b.entity.position.x,this.embed.original,b.entity.position.z):b.entity.position;
  if(pose.distanceTo(destination)<=stopRadius){this.stopFollowing();return false;}
  if(this.flight?.combat||this.flight?.gap)return true;
  if(Date.now()<(this.runtime.speedBlockedUntil||0)||speed===0){if(this.runtime.protectAnti?.())speed=undefined;else{this.stopFollowing();this.waiting='位置補正後の待機・経路を再確認中';return false;}}
  const old=this.following;this.following={kind,destination:destination.clone(),stopRadius,speed,plannedAt:old?.plannedAt||0,path:old?.kind===kind?old.path:null};
  if(!old||old.destination.distanceTo(destination)>1)this.following.plannedAt=0;
  const f=this.following;if(!f.plannedAt||Date.now()-f.plannedAt>350){f.path=require('./navigation').groundPath(b,pose,destination,{stopRadius:Math.max(.7,stopRadius-.6),jumpGaps:false,blocked:(a,c)=>this.edgeBlocked(a,c)});f.plannedAt=Date.now();}
  while(f.path?.length&&(f.path[0].action==='swim'?Math.hypot(pose.x-f.path[0].position.x-.5,pose.z-f.path[0].position.z-.5)<.35:pose.distanceTo(f.path[0].position.offset(.5,0,.5))<.3))f.path.shift();
  const gap=kind==='chase'?this.gapGoal(destination):null;if(gap&&(!f.path?.length||f.path.length>pose.distanceTo(gap)*1.8)){this.flight={goal:gap,gap:true,combat:true,landing:true,expires:Date.now()+4000};this.waiting='約4ブロック以内の隙間を低速GLIDEで追尾';return true;}
  const next=f.path?.[0];if(!next||next.action==='scaffold'){b.clearControlStates();b.desiredMoveSpeed=undefined;b.desiredMoveWorld=null;this.waiting='移動経路を再確認中';return false;}
  // Turning or changing hands does not cancel a world-space walking direction.
  const point=next.position.offset(.5,0,.5),direction=point.minus(pose),length=Math.hypot(direction.x,direction.z)||1;b.desiredMoveWorld={x:direction.x/length,z:direction.z/length};if(!b.actionHandBusy&&!this.runtime.paOwnsHand?.())b.lookAt(point.offset(0,1.62,0),false);b.setControlState('forward',true);b.setControlState('jump',require('./navigation').water(b.blockAt(pose.offset(0,1.62,0)))||(['jump','shore'].includes(next.action)&&point.y-pose.y>.1&&point.y-pose.y<=1.05));b.setControlState('sprint',false);b.desiredMoveSpeed=speed>0?Math.min(speed,Math.hypot(point.x-pose.x,point.z-pose.z)):undefined;
  this.waiting=kind==='chase'?`敵を追尾中${speed?' / 速度'+speed:''}`:'徒歩移動中';return true;
 }
 stopFollowing(){this.following=null;this.bot.desiredMoveSpeed=undefined;this.bot.desiredMoveWorld=null;for(const key of ['forward','back','left','right','jump','sprint'])this.bot.setControlState(key,false);}
 edgeKey(from,to){const key=require('./util').key;return `${this.bot.dimensionId}:${key(from)}>${key(to)}`;}
 edgeBlocked(from,to){return (this.failedEdges?.get(this.edgeKey(from,to))||0)>Date.now();}
 dropLimit(){const n=Number(this.runtime.worker.state.maxDrop??64);return Number.isInteger(n)?Math.max(0,Math.min(384,n)):64;}
 groundOptions(extra={}){return {maxDrop:this.dropLimit(),canDig:block=>this.canDig(block),blocked:(a,c)=>this.edgeBlocked(a,c),...extra};}
 driveStep(walking=this.walking){
  if(!walking||this.walking!==walking)return false;const b=this.bot,p=b.entity.position,goal=walking.goal,delta=goal.minus(p),distance=Math.hypot(delta.x,delta.z);
  if(b.dimensionId!==walking.dimension||b.dead||!b.connected){walking.error='世界・接続状態が変わりました';this.stopFollowing();return false;}
  if(!require('./navigation').pass(b,goal.floored())){walking.error='移動先に新しい障害物があります';this.stopFollowing();return false;}
  if(distance<.16&&Math.abs(delta.y)<.25){this.stopFollowing();return false;}
  // Keep the chosen adjacent step while jumping or entering its cell. Running
  // A* again from that same cell used to return [] before the feet had arrived.
  const gap=walking.action==='jump-gap';if(gap&&!b.entity.onGround)walking.launched=true;
  const jumping=gap?!walking.launched&&b.entity.onGround:['jump','shore'].includes(walking.action)&&delta.y>.12&&delta.y<=1.05;
  this.following={kind:'walk-step',destination:goal.clone(),stopRadius:.16,speed:undefined,path:null};
  b.desiredMoveWorld=distance>.04?{x:delta.x/distance,z:delta.z/distance}:null;b.desiredMoveSpeed=Math.min(gap?.27:.21,distance);b.setControlState('sneak',false);
  const paused=Date.now()<(this.runtime.speedBlockedUntil||0);if(paused)walking.progressAt=Date.now();b.setControlState('forward',distance>.06&&!paused);b.setControlState('jump',jumping&&!paused);b.setControlState('sprint',false);
  if(!b.actionHandBusy&&!b.handUse)b.lookAt(goal.offset(0,1.62,0),false);
  const score=distance+Math.abs(delta.y);if(walking.best===undefined||score<walking.best-.04){walking.best=score;walking.progressAt=Date.now();}
  return true;
 }
 async moveStep(goal,action,signal,until){
  const b=this.bot,walking=this.walking={goal,action,origin:b.entity.position.floored(),dimension:b.dimensionId,at:Date.now(),progressAt:Date.now()};const drive=()=>this.driveStep(walking);
  try{drive();b.on('physicsTick',drive);await b.waitUntil(()=>{
   const airborne=['drop','jump-gap','jump'].includes(action)&&b.entity.onGround===false;
   if(!airborne&&until?.())return true;if(walking.error)throw Object.assign(Error(walking.error),{code:'PATH_WAIT'});
   if(b.dimensionId!==walking.dimension)throw Object.assign(Error('移動中に世界が変わりました'),{code:'PATH_WAIT'});
   if(!airborne&&Math.hypot(b.entity.position.x-goal.x,b.entity.position.z-goal.z)<.22&&Math.abs(b.entity.position.y-goal.y)<.25)return true;
   if(Date.now()-walking.progressAt>1800)throw Object.assign(Error('経路で進めません。障害物と採掘位置を再探索します'),{code:'PATH_WAIT'});return false;
  },Math.max(5000,Math.min(15000,3000+Math.max(0,walking.origin.y-goal.y)*80)),signal);}catch(e){if(!signal?.aborted&&b.connected&&!b.dead&&b.dimensionId===walking.dimension)e.code='PATH_WAIT';this.groundPlan=null;if(b.dimensionId===walking.dimension){if(e.code==='PATH_WAIT'&&!signal?.aborted){this.failedEdges??=new Map();for(const [k,until]of this.failedEdges)if(until<=Date.now())this.failedEdges.delete(k);this.failedEdges.set(this.edgeKey(walking.origin,goal.floored()),Date.now()+8000);if(this.following)this.following.plannedAt=0;b.worldMirror?.request(goal.x>>4,goal.z>>4,goal.y>>4,(goal.y+1.8)>>4,{force:true});this.lastPathFailure={at:Date.now(),from:{...walking.origin},to:{...goal},reason:e.message};}throw e;}}finally{b.removeListener('physicsTick',drive);if(this.walking===walking){this.walking=null;this.stopFollowing();}}
 }
 async breakObstacle(block,signal){
  await this.bot.dig(block,signal);const w=this.runtime.worker;if(w.running&&w.inArea?.(block.position)&&!w.owned(block.position)&&require('./mining').wanted(w,block)){
   const {addStat}=require('./util');addStat(w.state.stats,block.name);addStat(w.state.session,block.name);w.recordMined(block.name);this.runtime.manager.store.save();
  }
 }
 async recoverCollision(signal){
  const b=this.bot,w=this.runtime.worker,inspect=require('./positions').inspect,check=inspect(b,b.entity.position);
  if(!check.overlaps.length){if(this.collisionRecovery?.phase!=='idle')this.collisionRecovery={phase:'idle'};return false;}
  if(this.runtime.protectAnti?.()||this.embed||this.flight)return false;
  const active=w.running||this.route||this.walking||this.following||this.runtime.follower?.config.enabled||this.runtime.pendingMove;
  if(!active||this.runtime.paused)return false;
  this.stopFollowing();
  if(this.floorEscape||this.prepareFloorEscape()){this.collisionRecovery={phase:'jump',at:Date.now(),reason:'浅い床の重なりからジャンプ'};return true;}
  if(!check.known){this.collisionRecovery={phase:'terrain',reason:'重なっている地形の受信待ち'};return true;}
  if(Date.now()-(this.collisionRefreshAt||0)>3000){const p=b.entity.position;this.collisionRefreshAt=Date.now();b.worldMirror?.request(p.x>>4,p.z>>4,p.y>>4,(p.y+1.8)>>4,{force:true});}
  if(b.handUse||b.actionHandBusy||b.mining)return true;
  if(Date.now()<(this.collisionRetryAt||0))return true;
  const p=b.entity.position,blocks=[];
  for(let x=Math.floor(p.x-.3);x<=Math.floor(p.x+.3-1e-7);x++)for(let z=Math.floor(p.z-.3);z<=Math.floor(p.z+.3-1e-7);z++)for(let y=Math.floor(p.y);y<=Math.floor(p.y+1.8-1e-7);y++){
   const block=b.blockAt(new Vec3(x,y,z)),owner=w.manager.claims?.get(`${b.dimensionId}:${x},${y},${z}`);if(block?.solid&&block.diggable&&block.hardness>=0&&(owner===undefined||owner===w.id)&&this.canDig(block)&&b.reach(block)&&b.visible(block))blocks.push(block);
  }
  blocks.sort((a,c)=>p.offset(0,1.62,0).distanceTo(a.position.offset(.5,.5,.5))-p.offset(0,1.62,0).distanceTo(c.position.offset(.5,.5,.5)));
  if(!blocks.length||!b.tool()){this.collisionRecovery={phase:'blocked',reason:!b.tool()?'埋まり解除用のピッケルがありません':'床・採掘範囲・指定ブロックを守るため、この重なりは自動で壊せません'};this.waiting=this.collisionRecovery.reason;this.collisionRetryAt=Date.now()+2000;return true;}
  const block=blocks[0];this.collisionRecovery={phase:'dig',position:{...block.position},name:block.name,at:Date.now()};this.waiting='重なっている許可ブロックを掘って復帰中';
  const claim=`${b.dimensionId}:${block.position.x},${block.position.y},${block.position.z}`,existing=w.manager.claims?.get(claim);w.manager.claims??=new Map();w.manager.claims.set(claim,w.id);
  try{await this.breakObstacle(block,signal);this.collisionRecovery={phase:'recheck',at:Date.now()};}catch(e){if(signal?.aborted)throw e;this.collisionRecovery={phase:'retry',reason:e.message,at:Date.now()};this.collisionRetryAt=Date.now()+2000;}finally{if(existing===undefined)w.manager.claims.delete(claim);}return true;
 }
 step(){const b=this.bot;b.straightTimerActive=false;if(!b.connected||b.dead)return false;
  if(this.floorEscape){const escape=this.floorEscape;if(Date.now()-escape.at>750||escape.expires&&Date.now()>=escape.expires){this.floorEscape=null;b.setControlState('jump',false);return false;}
   const result=require('../vendor/bedrockflayer/lib/physics/collision').moveEntity(b,b.entity,new Vec3(0,escape.velocity,0),.6,1.8);
   b.entity.position=new Vec3(result.position.x,result.position.y,result.position.z);b.entity.velocity=new Vec3(0,result.velocity.y,0);b.entity.onGround=false;b.setControlState('jump',true);escape.velocity=(escape.velocity-.08)*.98;
   if(b.entity.position.y>=escape.floor&&!require('./positions').inspect(b,b.entity.position).overlaps.length){this.floorEscape=null;b.setControlState('jump',false);b.collisionState={held:false,jumpedFromFloor:true};this.waiting='受信済みの床からジャンプして復帰';}return true;
  }
  const protectedAnti=this.runtime.protectAnti?.();if(this.flight&&protectedAnti&&!this.flight.jetpack){this.flight=null;if(b.gliding)this.glide(false);}
  if(this.flight&&this.embed)this.unbury();
  if(this.embed&&(!this.runtime.config.anticrystal||!protectedAnti&&Date.now()<(this.runtime.burrowBlockedUntil||0)))this.unbury();
  if(this.embed){
   if(this.following&&b.controlState.forward){const {moveEntity}=require('../vendor/bedrockflayer/lib/physics/collision'),logical=new Vec3(b.entity.position.x,this.embed.original,b.entity.position.z),yaw=b.entity.yaw||0,speed=b.handUse&&this.runtime.config.noSlow!==false?(this.runtime.config.eatSpeed??.12):(b.desiredMoveSpeed||.21);
    const vertical=b.controlState.jump&&b.entity.onGround? .42:(b.entity.velocity.y||0)-.08;
    const result=moveEntity(b,{...b.entity,position:logical},new Vec3((b.desiredMoveWorld?.x??-Math.sin(yaw))*speed,Math.max(-3.92,vertical),(b.desiredMoveWorld?.z??Math.cos(yaw))*speed),.6,1.8);
    const depth=this.embed.original-this.embed.y;this.embed.original=result.position.y;this.embed.y=result.position.y-depth;b.entity.position=new Vec3(result.position.x,result.position.y-depth,result.position.z);b.entity.velocity=new Vec3(result.velocity.x,result.velocity.y,result.velocity.z);b.entity.onGround=result.onGround;
   }else{b.entity.position.y=this.embed.y;b.entity.velocity=new Vec3(0,0,0);}this.rememberAnti();return true;
  }
  if(!this.flight)return false;
  const f=this.flight,p=b.entity.position,now=Date.now();
  if(f.holdGlide&&!f.roof&&!f.roofScanDone&&b.dimensionId===0&&Math.abs(p.x)<=512&&Math.abs(p.z)<=512&&now>(f.roofScanAt||0)){f.roofScanAt=now+2000;const roof=require('./roof').ceiling(b,p);if(roof&&Math.hypot(f.goal.x-p.x,f.goal.z-p.z)>24)f.roof=new(require('./roof').RoofNavigator)(b,f.goal,roof,sweptClear,.3+(this.runtime.config.flightClearance??1));}
  if(f.roof){const goal=f.roof.next(p);if(f.goal.distanceTo(goal)>.1){f.goal=goal;f.path=null;f.bestDistance=undefined;}this.waiting=f.roof.phase==='done'?'エリトラ移動中':`00の天井: ${f.roof.phase.includes('entry')?'降りる穴':'上へ抜ける穴'}を探索 / 確認${f.roof.searches}回`;}
  if(require('./navigation').water(b.blockAt(p))||require('./navigation').water(b.blockAt(p.offset(0,1.62,0)))){this.flight=null;b.controlState.forward=false;b.controlState.jump=false;if(b.gliding)this.glide(false);this.waiting='水中では飛行を解除し、通常の泳ぎで移動';return false;}
  if(f.jetpack&&(!f.expires||now>=f.expires)||f.gap&&now>=f.expires){this.flight=null;b.controlState.forward=false;b.controlState.jump=false;if(b.gliding)this.glide(false);this.waiting='追尾飛行を終了・通常落下';return false;}
  if(f.paused){b.controlState.forward=false;b.controlState.jump=false;const preserve=f.holdGlide&&!f.landing&&!f.jetpack&&!f.gap;if(!preserve&&b.gliding)this.glide(false);if(f.paused!=='replan'||now<(f.retryAt||0)){if(preserve&&bodyClear(b,p,.3)){b.entity.velocity=new Vec3(0,0,0);if(!b.gliding)this.glide(true);return true;}return false;}f.paused=false;f.path=null;}
  if(!f.jetpack&&!b.gliding&&b.entity.onGround){b.controlState.jump=true;return false;}
  b.controlState.jump=false;if(!f.jetpack&&!b.gliding)this.glide(true);
  const margin=f.landing||f.gap?.3:.3+(this.runtime.config.flightClearance??1);
  let target=f.path?.[0]?.position||f.goal;
  while(f.path?.length&&p.distanceTo(target)<.18){f.path.shift();f.bestDistance=undefined;target=f.path[0]?.position||f.goal;}
  if(f.goal.distanceTo(p)<.18){
   if(f.landing){b.controlState.forward=false;b.entity.onGround=!!landingFloor(b,p,0);this.flight=null;this.glide(false);this.waiting='着地済み';}
   b.entity.velocity=new Vec3(0,0,0);return true;
  }
  let delta=target.minus(p),horizontal=Math.hypot(delta.x,delta.z);
  if(f.bestDistance===undefined||delta.norm()<f.bestDistance-.1){f.bestDistance=delta.norm();f.progressAt=now;}
  else if(now-f.progressAt>3500){f.path=null;f.planAt=0;f.bestDistance=undefined;f.progressAt=now;}
  const slow=now<(this.flightSlowUntil||0)?.5:1;
  const hs=Math.min(f.gap?.17:f.jetpack?1.4:this.runtime.config.flyHorizontal*slow,horizontal),vs=Math.min(f.gap?.06:f.landing?.15:f.jetpack?.35:this.runtime.config.flyVertical*slow,Math.abs(delta.y));
  let next=p.offset(horizontal?delta.x/horizontal*hs:0,Math.sign(delta.y)*vs,horizontal?delta.z/horizontal*hs:0);
  // A path is followed one axis at a time near obstructions. Climb before crossing.
  if(!f.gap&&!f.landing&&Math.abs(delta.y)>.08&&horizontal>.05&&(!sweptClear(b,p,next,margin)||f.path?.length))next=p.offset(0,Math.sign(delta.y)*vs,0);
  if(!f.gap&&!f.landing&&!bodyClear(b,p,margin)){
   const before=wallDistance(b,p),options=[];
   for(const [x,y,z]of [[1,0,0],[-1,0,0],[0,0,1],[0,0,-1],[1,0,1],[1,0,-1],[-1,0,1],[-1,0,-1],[0,1,0],[0,-1,0]]){
    const q=p.offset(x*.15,y*.15,z*.15),score=wallDistance(b,q);if(score>before+.005&&sweptClear(b,p,q,.3))options.push({q,score});
   }
   const escape=options.sort((a,c)=>c.score-a.score)[0];if(escape){b.entity.velocity=escape.q.minus(p);b.entity.position=escape.q;b.controlState.forward=Math.hypot(b.entity.velocity.x,b.entity.velocity.z)>.001;b.lookAt(escape.q.offset(0,1.62,0),false);this.waiting='離隔を確保するため低速で壁から退避';return true;}
  }
  const corridor=sweptClear(b,p,next,margin);
  if(!corridor){
   b.controlState.forward=false;b.controlState.jump=false;if(now<(f.planAt||0)+250){b.entity.velocity=new Vec3(0,0,0);return !!f.holdGlide;}f.planAt=now;
   const path=require('./navigation').airDetour(b,p,f.goal,sweptClear,margin)||require('./navigation').airPath(b,p,f.goal,sweptClear,margin);
   if(!path.length||f.landing||f.gap){f.paused='replan';f.retryAt=now+1000;f.path=null;b.entity.velocity=new Vec3(0,0,0);this.waiting='1ブロックの間隔がある迂回経路を再探索中';return !!(f.holdGlide&&!f.landing&&!f.jetpack&&!f.gap&&bodyClear(b,p,.3));}
   f.path=path;f.bestDistance=undefined;this.waiting='壁から1ブロック離して迂回中';return true;
  }
  const movement=next.minus(p),direction=Math.abs(movement.x)<.001&&Math.abs(movement.z)>.001?'z':Math.abs(movement.z)<.001&&Math.abs(movement.x)>.001?'x':null;
  const heading=direction?direction+Math.sign(movement[direction]):null;
  b.straightTimerActive=!!(heading&&heading===f.lastHeading&&Math.abs(movement.y)<.001&&!f.jetpack&&!f.gap&&!f.landing&&!b.handUse&&!b.usingItem&&!b.mining&&!b.controlState.left&&!b.controlState.right&&!b.controlState.back&&this.runtime.config.straightTimer>0&&now>=(this.flightSlowUntil||0));f.lastHeading=heading;
  b.controlState.forward=Math.hypot(movement.x,movement.z)>.001;b.entity.velocity=movement;b.entity.position=next;b.entity.onGround=false;b.lookAt(next.offset(0,1.62,0),false);return true;
 }

 async tick(signal){const r=this.route,b=this.bot;if(!r)return;if(!b.terrainReady){this.waiting='足元の地形受信待ち';return;}
  if(r.dimension!==b.dimensionId){if(!r.portal){if(Date.now()-(r.portalSearchAt||0)>1000){r.portal=nearestPortal(b,r.dimension);r.portalSearchAt=Date.now();}if(!r.portal){this.waiting='歩いてネザーポータルを探索中';const p=b.entity.position,dirs=[[1,0],[0,1],[-1,0],[0,-1],[1,1],[-1,1],[-1,-1],[1,-1]],n=r.exploreStep||0,[dx,dz]=dirs[n%dirs.length];const goal=p.offset(dx*(6+Math.floor(n/8)%3*3),0,dz*(6+Math.floor(n/8)%3*3));r.exploreStep=n+1;await this.walk(goal,'walk',signal);return;}this.runtime.notice('ポータルへ移動します');}
   if(b.entity.position.distanceTo(r.portal.offset(.5,0,.5))>1)await this.walk(r.portal,r.mode==='dig'?'dig':'walk',signal);else{
    r.enteredAt||=Date.now();b.lookAt(r.portal.offset(.5,1,.5),false);b.setControlState('forward',b.entity.position.distanceTo(r.portal.offset(.5,0,.5))>.3);
    this.waiting='ポータル内でディメンション切替待ち';if(Date.now()-r.enteredAt>20000)throw Error('ポータルのディメンション切替を確認できません');
   }return;
  }
  if(b.entity.position.distanceTo(r.destination)<1){if(r.mode==='fly'&&this.flight){this.flight.goal=r.destination.clone();this.flight.roof=null;this.flight.holdGlide=true;this.route=null;this.waiting='指定座標で滑空を維持中。着地ボタンで解除';this.runtime.notice('指定座標へ到着しました。滑空を維持します');return;}if(this.flight){const floor=landingFloor(b,r.destination,3);if(!floor)throw Error('目的地の着地面を確認できません。飛行待機します');this.flight={goal:floor,landing:true};}this.route=null;if(['walk','dig'].includes(r.mode)&&this.runtime.worker.state.scaffoldCleanupPending){this.runtime.worker.cleanupRequested=true;this.runtime.worker.mode='cleaning';}this.runtime.notice('指定座標へ到着しました');return;}
  if(r.mode==='jetpack'){await this.runtime.crystals.jetpackTick({position:r.destination,player:false},signal);this.waiting=this.runtime.crystals.state;return;}
  if(r.mode==='fly'&&(require('./navigation').water(b.blockAt(b.entity.position))||require('./navigation').water(b.blockAt(b.entity.position.offset(0,1.62,0))))){if(!this.runtime.safety.active&&!this.runtime.safety.pending)this.runtime.safety.arm({resumeTravel:true});this.waiting='水中から足場へ泳いで抜けてから飛行を再開';return;}
  if(r.mode==='fly'){if(!b.terrainEstablished&&!b.entity.onGround){this.waiting='飛行開始前の足場確認待ち';return;}if(r.mode==='fly'){if(b.name(b.armor[1])!=='elytra'){await wear(b,{armor:true,totem:true,elytra:true},signal);if(b.name(b.armor[1])!=='elytra')throw Error('エリトラを補給してください');}if(b.damage(b.armor[1])>=422)throw Error('エリトラの耐久が少なくなりました');}if(!this.flight){this.flight={goal:r.destination.clone(),landing:false,jetpack:false,holdGlide:true};if(b.dimensionId===0&&Math.abs(b.entity.position.x)<=512&&Math.abs(b.entity.position.z)<=512){const roof=require('./roof').ceiling(b,b.entity.position);if(roof&&Math.hypot(r.destination.x-b.entity.position.x,r.destination.z-b.entity.position.z)>24)this.flight.roof=new(require('./roof').RoofNavigator)(b,r.destination,roof,sweptClear,.3+(this.runtime.config.flightClearance??1));}}this.waiting=this.flight.paused?this.waiting:r.mode==='jetpack'?'Jetpack移動中':'エリトラ移動中';return;}
  this.waiting=r.mode==='dig'?'採掘しながら移動中':'徒歩移動中';await this.walk(r.destination,r.mode,signal);
 }
 async walk(destination,mode,signal,{until,allowScaffold=true}={}){const b=this.bot,p=b.entity.position,dx=destination.x-p.x,dz=destination.z-p.z;
  if(until?.()||p.distanceTo(destination)<.22)return;
  if(p.floored().equals(destination.floored())&&require('./navigation').pass(b,destination.floored())){await this.moveStep(destination,'walk',signal,until);return;}
  const state=this.runtime.worker.state,stocked=allowScaffold&&state.scaffoldEnabled!==false&&(b.list?.().find(i=>i.name===state.scaffold)||b.list?.().find(i=>['cobblestone','stone','dirt','obsidian','slime','slime_block'].includes(i.name)));
  const signature=JSON.stringify([b.dimensionId,destination.x,destination.y,destination.z,mode,stocked?.name,state.floor,this.runtime.worker.running,this.runtime.worker.miner?.layer,state.miningFilter,this.dropLimit()]);
  let plan=this.groundPlan;if(plan?.signature!==signature||Date.now()-plan.at>15000)plan=null;
  if(plan){while(plan.path.length&&b.entity.position.distanceTo(plan.path[0].position.offset(.5,0,.5))<.28)plan.path.shift();const first=plan.path[0];if(first&&!['dig','pillar'].includes(first.action)&&!require('./navigation').pass(b,first.position))plan=null;}
  if(!plan||!plan.path.length){const path=require('./navigation').groundPath(b,p,destination,this.groundOptions({block:stocked,dig:mode==='dig'}));plan=this.groundPlan={signature,path,goal:destination.clone(),dimension:b.dimensionId,at:Date.now(),reached:path.reached,cost:path.cost,radius:path.radius,origin:p.clone()};}
  const path=plan.path,next=path[0];if(next&&!plan.reached){const remaining=path.at(-1).position.offset(.5,0,.5).distanceTo(destination);if(Math.hypot(dx,dz)<(plan.radius||14)-2||remaining>p.distanceTo(destination)-4)throw Object.assign(Error('目的地までつながる経路を確認できません。部分経路を往復せず再探索します'),{code:'PATH_WAIT'});}
  if(next){if(next.action==='pillar'){await this.pillar(stocked,signal);return;}if(next.action==='dig'){for(const point of [next.position.offset(0,1,0),next.position]){const block=b.blockAt(point);if(block?.solid){if(!this.canDig(block))throw Error('採掘の範囲・対象外のブロックは壊しません');await this.breakObstacle(block,signal);}}next.action='walk';return;}if(next.action==='scaffold'){const support=next.position.offset(0,-1,0);if(!solid(b.blockAt(support))){await this.runtime.worker.placeOwned(support,b.find(stocked.name), 'scaffold',signal,{timeout:1800});}next.action=next.position.y>p.y+.5?'jump':'walk';this.waiting='設置を確認・足場へ移動中';}
   if(next.action==='swim'){this.waiting='水面を泳いで移動中';b.lookAt(next.position.offset(.5,1,.5),false);b.setControlState('forward',true);b.setControlState('jump',require('./navigation').water(b.blockAt(b.entity.position.offset(0,1.62,0)))||next.position.y>b.entity.position.y+.2);await new Promise((resolve,reject)=>{const timer=setTimeout(resolve,200);const abort=()=>{clearTimeout(timer);reject(Error('停止しました'));};signal?.addEventListener('abort',abort,{once:true});setTimeout(()=>signal?.removeEventListener('abort',abort),210);});return;}
   this.waiting=next.action==='jump-gap'?'着地点を確認・ジャンプして隙間を渡る':next.action==='drop'?'受信済みの下段へ落下して降りる':next.action==='jump'?'段差をジャンプして移動中':'徒歩移動中';await this.moveStep(next.position.offset(.5,0,.5),next.action,signal,until);return;
  }
  this.groundPlan=null;b.clearControlStates();throw Object.assign(Error('受信済み地形に目的地までつながる安全な経路がありません。周囲を再確認します'),{code:'PATH_WAIT'});
 }
 canDig(block){const w=this.runtime.worker;if(!w.running)return w.state.floor===null||block.position.y>w.state.floor;return w.inArea(block.position)&&require('./mining').wanted(w,block)&&block.position.y>=(w.miner?.layer??w.state.floor+1);}
 async pillar(item,signal){
  const b=this.bot,p=b.entity.position,feet=p.floored();if(!item)throw Error('積み上げるブロックがありません');if(this.runtime.protectAnti?.())throw Error('戦闘中のAntiを維持するため積み上げを待機します');
  if(!b.entity.onGround||!solid(b.blockAt(feet.offset(0,-1,0)))||!bodyClear(b,feet.offset(.5,1,.5)))throw Object.assign(Error('積み上げ用の足場・頭上を確認中'),{code:'PATH_WAIT'});
  const center=feet.offset(.5,0,.5);if(Math.hypot(p.x-center.x,p.z-center.z)>.12){const drive=()=>{const d=center.minus(b.entity.position),length=Math.hypot(d.x,d.z)||1;b.desiredMoveWorld={x:d.x/length,z:d.z/length};b.desiredMoveSpeed=Math.min(.12,length);b.setControlState('forward',true);};try{b.on('physicsTick',drive);drive();await b.waitUntil(()=>Math.hypot(b.entity.position.x-center.x,b.entity.position.z-center.z)<.12,2000,signal);}finally{b.removeListener('physicsTick',drive);this.stopFollowing();}}
  await b.equip(item.slot,signal);this.stopFollowing();b.setControlState('jump',true);this.waiting='ジャンプして足元へ1個ずつ積み上げ';
  try{await b.waitUntil(()=>b.entity.position.y>=feet.y+1.02,1200,signal);b.setControlState('jump',false);const block=b.find(item.name);if(!block)throw Error('積み上げるブロックがなくなりました');await this.runtime.worker.placeOwned(feet,block,'scaffold',signal);await b.waitUntil(()=>b.entity.onGround&&b.entity.position.y>=feet.y+.9,2200,signal);}finally{b.setControlState('jump',false);}
 }
 rememberAnti(){const p=this.bot.entity.position;if(this.embed)this.antiAnchor={original:this.embed.original,depth:this.embed.original-this.embed.y,x:p.x,z:p.z,dimension:this.bot.dimensionId,at:Date.now()};}
 prepareFloorEscape(){
  if(this.runtime.protectAnti?.())return false;
  const b=this.bot,p=b.entity?.position;if(!p||this.embed||this.floorEscape||Date.now()<(this.floorEscapeRetryAt||0))return false;
  const check=require('./positions').inspect(b,p);if(!check.known||!check.overlaps.length)return false;const top=Math.max(...check.overlaps.map(box=>box.maxY)),depth=top-p.y;
  if(depth<=.125||depth>.8)return false;
  const candidate=new Vec3(p.x,top,p.z),clear=require('./positions').inspect(b,candidate);if(!clear.known||clear.overlaps.length||!clear.support||!bodyClear(b,candidate))return false;
  // A reconnect has no owned Anti anchor. Try one ordinary vertical jump from
  // the received server pose, with real collision shapes, rather than snapping
  // to an invented floor. A new server correction stops this attempt.
  this.floorEscape={at:Date.now(),floor:top,velocity:.42};this.floorEscapeRetryAt=Date.now()+10000;this.waiting='受信済みの浅い床の重なりからジャンプで復帰中';return true;
 }
 recoverAnti(allowJump=true){
  if(this.flight?.jetpack)return false;
  if(this.runtime.protectAnti?.()){this.antiRecovery=null;return this.adoptCombatAnti();}
  const recovery=this.antiRecovery||this.antiAnchor,b=this.bot;if(!recovery||Date.now()-recovery.at>30000||!b.entity||recovery.dimension!==b.dimensionId){this.antiRecovery=null;return allowJump?this.prepareFloorEscape():false;}
  if(Date.now()-recovery.at<200)return false;
  const p=b.entity.position,check=require('./positions').inspect(b,p);
  if(this.embed||!check.overlaps.length){this.antiRecovery=null;return false;}
  // Only undo our own recorded Anti depth. An unrelated wall, teleport or
  // unreceived section never authorizes moving the player through terrain.
  if(Math.hypot(p.x-recovery.x,p.z-recovery.z)>8||Math.abs(p.y-(recovery.original-recovery.depth))>.15)return false;
  const candidate=new Vec3(p.x,recovery.original,p.z),verified=require('./positions').inspect(b,candidate);
  if(verified.known&&!verified.overlaps.length&&verified.support){b.entity.position=candidate;b.entity.velocity=new Vec3(0,0,0);b.entity.onGround=true;b.collisionState={held:false,recoveredAnti:true};this.antiRecovery=null;this.waiting='Antiの直前に確認した足場へ復帰';return true;}return false;
 }
 adoptCombatAnti(){
  const b=this.bot,p=b.entity?.position;if(!p||this.embed)return false;
  const check=require('./positions').inspect(b,p);if(!check.known||!check.overlaps.length)return false;
  const top=Math.max(...check.overlaps.map(box=>box.maxY)),depth=top-p.y;
  if(depth<=.125||depth>Math.min(.9,(this.runtime.config.burrowDepth??.55)+.15))return false;
  const logical=new Vec3(p.x,top,p.z),clear=require('./positions').inspect(b,logical);
  if(!clear.known||clear.overlaps.length||!clear.support)return false;
  // Rebase on the accepted server pose without lifting out of Anti.
  this.embed={y:p.y,original:top};this.floorEscape=null;this.rememberAnti();b.entity.onGround=true;b.collisionState={held:false,combatAnti:true};this.waiting='サーバー位置を基準にAntiを維持';return true;
 }
 bury(depth){if(require('./realms').isIgn(this.runtime))return false;const b=this.bot,p=b.entity.position,floor=b.blockAt(p.offset(0,-.1,0));if(!b.entity.onGround||!solid(floor)||!bodyClear(b,p))return false;this.antiRecovery=null;this.embed={y:p.y-depth,original:p.y};this.rememberAnti();return true;}
 unbury(){if(this.embed){this.rememberAnti();this.bot.entity.position.y=this.embed.original;this.bot.entity.velocity=new Vec3(0,0,0);this.bot.entity.onGround=true;this.embed=null;}else this.recoverAnti(false);}
}
module.exports={Travel,bodyClear,sweptClear,landingFloor,nearestPortal,dimension,validateGoal,wallDistance};
