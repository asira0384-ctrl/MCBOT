'use strict';
const {Vec3}=require('vec3');const {air,solid,hazard}=require('./util');const {wear}=require('./equipment');
const dimensions={overworld:0,nether:1,end:2,現世:0,ネザー:1,エンド:2};
function dimension(value){if(Object.hasOwn(dimensions,value))return dimensions[value];const n=Number(value);if(Number.isInteger(n)&&n>=0&&n<=2)return n;throw Error('ディメンション: overworld / nether / end');}
function validateGoal(mode,dim,x,y,z){if(!['walk','dig','fly','jetpack'].includes(mode))throw Error('移動方法: walk / dig / fly / jetpack');const destination=new Vec3(...[x,y,z].map(Number));if(![destination.x,destination.y,destination.z].every(Number.isFinite)||Math.abs(destination.x)>30000000||Math.abs(destination.z)>30000000||destination.y< -64||destination.y>319)throw Error('座標の範囲が不正です');return {mode,dimension:dimension(dim),destination};}
function bodyClear(bot,p,margin=.3){for(let x=Math.floor(p.x-margin);x<=Math.floor(p.x+margin);x++)for(let z=Math.floor(p.z-margin);z<=Math.floor(p.z+margin);z++)for(let y=Math.floor(p.y);y<=Math.floor(p.y+1.79);y++){const b=bot.blockAt({x,y,z});if(!b||b.solid||b.isLiquid||/unknown|fire|lava/.test(b.name))return false;}return true;}
function sweptClear(bot,from,to,margin=.3){const delta=to.minus(from),n=Math.max(1,Math.ceil(delta.norm()*5));for(let i=0;i<=n;i++)if(!bodyClear(bot,from.plus(delta.scaled(i/n)),margin))return false;return true;}
function landingFloor(bot,p,max=10){for(let d=0;d<=max;d++){const y=Math.floor(p.y)-d,q=new Vec3(Math.floor(p.x),y,Math.floor(p.z));if(solid(bot.blockAt(q.offset(0,-1,0)))&&bodyClear(bot,q.offset(.5,0,.5)))return q.offset(.5,0,.5);}return null;}
function nearestPortal(bot,toDimension){if(bot.dimensionId===2||toDimension===2)throw Error('自動探索は現世とネザーのポータルに対応します');const p=bot.entity.position;let best=null,dist=Infinity;
 for(const [id]of bot.worldMirror.columns){const [cx,cz]=id.split(',').map(Number);if(Math.abs(cx*16-p.x)>48||Math.abs(cz*16-p.z)>48)continue;
  for(let x=cx*16;x<cx*16+16;x++)for(let z=cz*16;z<cz*16+16;z++)for(let y=Math.max(bot.dimensionId===1?0:-64,Math.floor(p.y)-16);y<=Math.floor(p.y)+16;y++){const q=new Vec3(x,y,z),b=bot.blockAt(q);if(b&&/^(portal|nether_portal)$/.test(b.name)&&p.distanceTo(q)<dist&&solid(bot.blockAt(q.offset(0,-1,0)))){best=q;dist=p.distanceTo(q);}}
 }return best;
}
class Travel{
 constructor(runtime){this.runtime=runtime;this.bot=runtime.bot;this.route=null;this.flight=null;this.embed=null;this.waiting='';
  this.bot.motion=this;this.bot.on('dimensionChanged',()=>{this.flight=null;this.embed=null;if(this.route){this.route.portal=null;this.route.enteredAt=0;this.waiting='新しい地形の受信待ち';}});
 }
 command(mode,dim,x,y,z){const goal=validateGoal(mode,dim,x,y,z);this.cancel(false);this.route={...goal,portal:null,enteredAt:0};this.waiting='移動準備';}
 glide(on){if(this.bot.gliding===on)return;this.bot.gliding=on;this.bot.pendingGlide=on?'start':'stop';this.bot.client.queue('player_action',{runtime_entity_id:BigInt(this.bot._runtimeEntityId),action:on?'start_glide':'stop_glide',position:{x:0,y:0,z:0},result_position:{x:0,y:0,z:0},face:0});}
 cancel(land=true){this.route=null;this.unbury();this.waiting='';if(this.flight&&land){const floor=landingFloor(this.bot,this.bot.entity.position,16);if(floor){this.flight={goal:floor,landing:true};this.waiting='着地中';return;}this.flight={goal:this.bot.entity.position.clone(),paused:true};this.waiting='着地点が未受信・飛行待機';return;}this.flight=null;if(this.bot.gliding)this.glide(false);}
 rollback(){if(this.embed)this.runtime.burrowBlockedUntil=Date.now()+10000;this.embed=null;if(this.flight){this.flight={goal:this.bot.entity.position.clone(),paused:true};this.route=null;this.waiting='位置補正を受信・飛行待機';this.runtime.notice(this.waiting);}}
 step(){const b=this.bot;if(!b.connected||b.dead)return false;
  if(this.embed&&!this.runtime.config.anticrystal)this.unbury();
  if(this.embed){b.entity.position.y=this.embed.y;b.entity.velocity=new Vec3(0,0,0);return true;}
  if(!this.flight)return false;
  const f=this.flight,p=b.entity.position;
  // A suspended flight must release the physics override, not hover forever.
  if(f.paused){b.controlState.jump=false;if(b.gliding)this.glide(false);return false;}
  if(!f.jetpack&&!b.gliding&&b.entity.onGround){b.controlState.jump=true;return false;}
  b.controlState.jump=!!f.jetpack;if(!f.jetpack&&!b.gliding)this.glide(true);
  const delta=f.goal.minus(p);if(delta.norm()<.15){if(f.landing){b.entity.onGround=true;this.flight=null;this.glide(false);this.waiting='着地済み';}b.entity.velocity=new Vec3(0,0,0);return true;}
  if(f.bestDistance===undefined||delta.norm()<f.bestDistance-.3){f.bestDistance=delta.norm();f.progressAt=Date.now();}else if(Date.now()-f.progressAt>5000){f.paused=true;this.waiting='飛行が進まないため待機';this.runtime.notice(this.waiting);b.entity.velocity=new Vec3(0,0,0);return true;}
  const horizontal=Math.hypot(delta.x,delta.z),hs=Math.min(f.jetpack?.25:this.runtime.config.flyHorizontal,horizontal),vs=Math.min(f.landing?.15:f.jetpack?.35:this.runtime.config.flyVertical,Math.abs(delta.y));
  let next=p.offset(horizontal?delta.x/horizontal*hs:0,Math.sign(delta.y)*vs,horizontal?delta.z/horizontal*hs:0);
  if(!sweptClear(b,p,next,f.landing?.3:1.05)){
   const candidates=[p.offset(-delta.z/(horizontal||1)*2,0,delta.x/(horizontal||1)*2),p.offset(delta.z/(horizontal||1)*2,0,-delta.x/(horizontal||1)*2),p.offset(0,2,0)];
   const detour=candidates.filter(q=>sweptClear(b,p,q,1.05)).sort((a,c)=>a.distanceTo(f.goal)-c.distanceTo(f.goal))[0];
   if(!detour||f.landing){f.paused=true;b.entity.velocity=new Vec3(0,0,0);this.waiting='壁・未受信地形の手前で飛行待機';this.runtime.notice(this.waiting);return true;}
   const dir=detour.minus(p),len=dir.norm();next=p.plus(dir.scaled(Math.min(.25,len)/len));
  }
  b.entity.velocity=next.minus(p);b.entity.position=next;b.entity.onGround=false;b.lookAt(f.goal.offset(0,1.62,0),false);return true;
 }
 async tick(signal){const r=this.route,b=this.bot;if(!r)return;if(!b.terrainReady){this.waiting='足元の地形受信待ち';return;}
  if(r.dimension!==b.dimensionId){if(!r.portal){r.portal=nearestPortal(b,r.dimension);if(!r.portal)throw Error('周辺の受信済み地形にネザーポータルが見つかりません');this.runtime.notice('ポータルへ移動します');}
   if(b.entity.position.distanceTo(r.portal.offset(.5,0,.5))>1)await this.walk(r.portal,r.mode==='dig'?'dig':'walk',signal);else{
    r.enteredAt||=Date.now();b.lookAt(r.portal.offset(.5,1,.5),false);b.setControlState('forward',b.entity.position.distanceTo(r.portal.offset(.5,0,.5))>.3);
    this.waiting='ポータル内でディメンション切替待ち';if(Date.now()-r.enteredAt>20000)throw Error('ポータルのディメンション切替を確認できません');
   }return;
  }
  if(b.entity.position.distanceTo(r.destination)<1){if(this.flight){const floor=landingFloor(b,r.destination,3);if(!floor)throw Error('目的地の着地面を確認できません。飛行待機します');this.flight={goal:floor,landing:true};}this.route=null;this.runtime.notice('指定座標へ到着しました');return;}
  if(r.mode==='fly'||r.mode==='jetpack'){if(!b.terrainEstablished&&!b.entity.onGround){this.waiting='飛行開始前の足場確認待ち';return;}if(r.mode==='fly'){if(b.name(b.armor[1])!=='elytra'){await wear(b,{armor:true,totem:true,elytra:true},signal);if(b.name(b.armor[1])!=='elytra')throw Error('エリトラを補給してください');}if(b.damage(b.armor[1])>=422)throw Error('エリトラの耐久が少なくなりました');}this.flight??={goal:r.destination,landing:false,jetpack:r.mode==='jetpack'};this.waiting=this.flight.paused?this.waiting:r.mode==='jetpack'?'Jetpack移動中':'エリトラ移動中';return;}
  this.waiting=r.mode==='dig'?'採掘しながら移動中':'徒歩移動中';await this.walk(r.destination,r.mode,signal);
 }
 async walk(destination,mode,signal){const b=this.bot,beforeDimension=b.dimensionId,p=b.entity.position,dx=destination.x-p.x,dz=destination.z-p.z;const horizontal=Math.hypot(dx,dz);if(horizontal<.5&&Math.abs(destination.y-p.y)>1.5)throw Error('上下へ進む経路がありません');
  const limit=Math.min(6,horizontal),x=p.x+(horizontal?dx/horizontal*limit:0),z=p.z+(horizontal?dz/horizontal*limit:0);let spot=null;
  for(const dy of [0,1,-1]){const q=new Vec3(Math.floor(x),Math.floor(p.y)+dy,Math.floor(z));if(bodyClear(b,q.offset(.5,0,.5))&&solid(b.blockAt(q.offset(0,-1,0)))){spot=q;break;}}
  if(spot){try{await b.go(spot,signal);return;}catch(e){if(b.dimensionId!==beforeDimension)return;if(signal.aborted||mode!=='dig')throw e;}}
  if(mode!=='dig')throw Error('受信済み地形に安全な徒歩経路がありません');
  const sx=Math.abs(dx)>=Math.abs(dz)?Math.sign(dx):0,sz=sx?0:Math.sign(dz),q=new Vec3(Math.floor(p.x)+sx,Math.floor(p.y),Math.floor(p.z)+sz);
  if(!solid(b.blockAt(q.offset(0,-1,0))))throw Error('移動先の足場がありません');
  for(const target of [q.offset(0,1,0),q]){const block=b.blockAt(target);if(!block)throw Error('採掘する地形が未受信です');if(air(block))continue;if(hazard(block)||!block.diggable||block.hardness<0)throw Error('移動先に破壊できない・危険なブロックがあります');if(this.runtime.worker.state.floor!==null&&target.y<=this.runtime.worker.state.floor)throw Error('保護している床は掘りません');await b.dig(block,signal);const w=this.runtime.worker;if(!w.owned(target)){const {addStat}=require('./util');addStat(w.state.stats,block.name);addStat(w.state.session,block.name);w.recordMined(block.name);this.runtime.manager.store.save();}}
  await b.go(q,signal);
 }
 bury(depth){const b=this.bot,p=b.entity.position,floor=b.blockAt(p.offset(0,-.1,0));if(!b.entity.onGround||!solid(floor)||!bodyClear(b,p))return false;this.embed={y:p.y-depth,original:p.y};return true;}
 unbury(){if(this.embed){this.bot.entity.position.y=this.embed.original;this.bot.entity.velocity=new Vec3(0,0,0);this.embed=null;}}
}
module.exports={Travel,bodyClear,sweptClear,landingFloor,nearestPortal,dimension,validateGoal};
