'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {Vec3}=require('vec3');
const {fixture}=require('./helpers/mining-world');
const floor=require('../modules/world/mining/mining-floor');
const {groundPathAsync}=require('../modules/movement/navigation/navigation');

test('fills a floor hole, preserves its block through cleanup and leaves adjacent terrain alone',async t=>{
 const f=fixture(t),hole=new Vec3(1,64,0),outside=new Vec3(2,64,0);
 f.w.state.area={x1:0,x2:1,z1:0,z2:0};f.w.running=true;f.w.miner.prepare();
 f.b.items[2]=f.item('cobblestone',22);
 f.set(hole,'air');f.set(outside,'air');
 f.b.place=async(pos,item)=>{assert(pos.equals(hole));f.set(pos,item.name);};
 assert.equal(await floor.finish(f.w),false);
 assert.equal(f.b.blockAt(hole).name,'cobblestone');assert(!f.w.owned(hole));
 await floor.finish(f.w);assert.equal(await floor.finish(f.w),true);
 await f.w.cleanup();assert.equal(f.b.blockAt(hole).name,'cobblestone');assert.equal(f.b.blockAt(outside).name,'air');
 f.set(hole,'air');assert.equal(await floor.finish(f.w),false);assert.equal(f.b.blockAt(hole).name,'cobblestone');
});

test('a landed miner takes a natural step up and otherwise pillars with carried blocks',async t=>{
 const f=fixture(t);f.w.state.floor=66;f.b.items[2]=f.item('cobblestone',22);
 const rise=new Vec3(1,65,0);f.set(rise,'stone');
 let climbed=0,walked=0;f.travel.walk=async point=>{assert.equal(point.y,66);walked++;};f.travel.pillar=async item=>{assert.equal(item.name,'cobblestone');climbed++;};
 await floor.recover(f.w);assert.equal(walked,1);assert.equal(climbed,0);
 f.set(rise,'air');await floor.recover(f.w);assert.equal(climbed,1);
});

test('ten simultaneous route searches respect separate minimum walking heights and yield to timers',async t=>{
 const f=fixture(t),p=new Vec3(0,70,0);f.set(p.offset(0,-1,0),'obsidian');
 let turns=0;const timer=setInterval(()=>turns++,1);
 try{const paths=await Promise.all(Array.from({length:10},(_,i)=>groundPathAsync(f.b,p,new Vec3(12,65,i),{minY:i%2?65:70,maxDrop:16,limit:350})));
 for(let i=0;i<paths.length;i++){assert(paths[i].every(step=>step.position.y>=(i%2?65:70)));if(i%2)assert(paths[i].reached);}
 assert(turns>0);
 }finally{clearInterval(timer);}
});

test('ItemDrop off retains a full mined stack, on drops it',async t=>{
 const f=fixture(t);f.w.state.minedItems=['stone'];f.w.state.itemDrop=false;
 f.b.list=()=>[{name:'stone',count:64,slot:5}];let count=0;f.b.drop=async(slot,n)=>{assert.equal(slot,5);count+=n;};
 await f.w.discard(new AbortController().signal);assert.equal(count,0);
 f.w.state.itemDrop=true;await f.w.discard(new AbortController().signal);assert.equal(count,64);
});

test('starting Nuke during terrain load queues the job and releases the old circle slot',t=>{
 const f=fixture(t);f.b.terrainReady=false;
 const circle=f.r.circle={excluded:new Set()};assert.equal(f.w.start(),false);assert(f.w.startRequested);assert(circle.excluded.has(f.w.id));assert.equal(f.r.circle,null);
 f.w.stop();assert.equal(f.w.startRequested,false);
});

test('a pillar waits through jump cooldown, places while rising and finishes on the confirmed block',async t=>{
 const f=fixture(t,{physics:true});
 f.b._jumpCooldown=5;f.b.items[2]=f.item('cobblestone',22);f.w.running=true;
 f.w.placeOwned=async(pos,item)=>{
  assert(f.b.entity.position.y>pos.y+1);
  assert(f.b.entity.velocity.y>=0);
  assert.equal(item.slot,f.b.quickBarSlot);
  f.set(pos,item.name);
 };
 await f.travel.pillar(f.b.list().find(i=>i.name==='cobblestone'),new AbortController().signal);
 assert(f.b.entity.onGround);assert.equal(f.b.entity.position.floored().y,66);
 assert.equal(f.travel.jumpRecovery.phase,'landed');assert.equal(f.b.controlState.jump,false);
});

test('a block outside center reach can be aimed at its visible near face',t=>{
 const f=fixture(t),q=new Vec3(5,66,0);f.set(q,'obsidian');
 const target=f.b.blockAt(q),eye=f.b.entity.position.offset(0,1.62,0);
 assert(eye.distanceTo(q.offset(.5,.5,.5))>4.6);
 const aim=require('../modules/world/mining/mining-reach').aim(f.b,target,4.6);
 assert(aim);assert.equal(aim.face,4);assert(eye.distanceTo(aim.point)<=4.6);
 f.set(new Vec3(3,66,0),'stone');assert.equal(require('../modules/world/mining/mining-reach').aim(f.b,target,4.6),null);
});

test('an unconfirmed dig releases its claim and requires a different stance for the same block',async t=>{
 const f=fixture(t),q=new Vec3(1,65,0);f.set(q,'stone');f.w.running=true;
 f.w.chooseTarget=()=>f.b.blockAt(q);f.b.dig=async()=>{throw Object.assign(Error('no block update'),{code:'DIG_UNCONFIRMED'});};
 await f.w.tick();assert.equal(f.w.manager.claims.size,0);assert.equal(f.w.state.stats.total,0);assert.equal(f.w.canMineHere(f.b.blockAt(q)),false);
 f.b.entity.position=new Vec3(.5,65,1.5);assert.equal(f.w.canMineHere(f.b.blockAt(q)),true);
});

test('walking climbs a one-block step with a delayed jump cooldown',async t=>{
 const f=fixture(t,{physics:true}),goal=new Vec3(1.5,66,.5);
 f.b._jumpCooldown=5;f.set(new Vec3(1,65,0),'stone');
 await f.travel.moveStep(goal,'jump',new AbortController().signal);
 assert(f.b.entity.onGround);assert(Math.abs(f.b.entity.position.y-goal.y)<.25);
 assert(Math.abs(f.b.entity.position.x-goal.x)<.23);
});

test('mining stays paused between mob attacks and resumes after the last in-range mob leaves',async t=>{
 const f=fixture(t),{MobAura}=require('../modules/combat/mob-aura/mobaura');
 f.w.running=true;f.w.mode='running';f.w.state.mobAura={enabled:true,range:4,delay:2000};
 f.b.items[2]=f.item('netherite_sword',22);f.w.mobAura=new MobAura(f.w);
 let scans=0;f.w.chooseTarget=()=>{scans++;return null;};f.w.explore=async()=>{};
 for(const [id,name] of [['2','magma_cube'],['3','piglin']])f.b.actors.set(id,{id:BigInt(id),name:'minecraft:'+name,dimension:0,position:new Vec3(2.5,65,.5)});
 await f.w.tick();assert.equal(f.w.mobAura.attacks,1);assert.equal(scans,0);
 f.b.actors.delete('2');await f.w.tick();assert.equal(scans,0);
 f.b.actors.delete('3');await f.w.tick();assert.equal(scans,1);
});

test('a new goto command takes movement away from Circle for the selected bot',t=>{
 const f=fixture(t),ring={excluded:new Set()};
 const runtime=Object.assign(f.r,{circle:ring,selfDefense:{stop(){}},follower:{stop(){}},manager:f.w.manager,notice(){}});
 require('../src/app/runtime').Runtime.prototype.requestMove.call(runtime,'walk','overworld',5,66,0);
 assert.equal(runtime.circle,null);assert(ring.excluded.has(f.w.id));assert.equal(runtime.paused,false);
 assert.deepEqual(runtime.pendingMove,['walk','overworld',5,66,0]);
});
