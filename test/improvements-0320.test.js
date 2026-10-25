'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3');
const {fixture,peer}=require('./helpers/mining-world'),{groundPath,dropLanding,pass}=require('../src/navigation');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,ms=4000){const end=Date.now()+ms;while(!fn()){assert(Date.now()<end,'condition timed out');await sleep(5);}}

for(const height of [8,24,64])test(`a ${height}-block descent uses real gravity and waits for landing without placing blocks`,async t=>{
 const f=fixture(t,{physics:true}),{b,w,set,travel}=f;b.entity.position=new Vec3(.5,65+height,.5);b.entity.onGround=true;set(new Vec3(0,64+height,0),'stone');b.items[5]={...f.item('cobblestone'),count:64};
 const goal=new Vec3(1.5,65,.5),path=groundPath(b,b.entity.position,goal,travel.groundOptions({block:b.find('cobblestone')}));assert(path.reached);assert.equal(path[0].action,'drop');assert.equal(path.placements,0);
 let falling=false,lowest=Infinity;b.on('physicsTick',()=>{falling||=b.entity.onGround===false;lowest=Math.min(lowest,b.entity.position.y);});
 await travel.walk(goal,'walk',undefined,{until:()=>falling});assert(falling);assert(b.entity.onGround);assert(b.entity.position.distanceTo(goal)<.3);assert(lowest>=65-.01);assert.equal(Object.keys(w.state.owned).length,0);assert(!f.packets.some(p=>p.params.transaction?.transaction_data?.action_type==='click_block'));
});
test('unknown terrain, an obstructed shaft, lava and a missing floor never become permitted long falls',t=>{
 const f=fixture(t),{b,set}=f,entry=new Vec3(1,90,0);assert.equal(dropLanding(b,entry,64).y,65);assert.equal(dropLanding(b,entry,3),null);
 const get=b.blockAt;b.blockAt=p=>p.y===80?null:get(p);assert.equal(dropLanding(b,entry,64),null);b.blockAt=get;set(new Vec3(1,82,0),'stone');assert.equal(dropLanding(b,entry,64).y,83);set(new Vec3(1,82,0),'lava');assert.equal(dropLanding(b,entry,64),null);b.blockAt=p=>p.y<90?{name:'air',isAir:true,solid:false,shapes:[]}:get(p);assert.equal(dropLanding(b,entry,64),null);
});
test('ground routing reaches a known target beyond the old 14-block radius without choosing a partial loop',t=>{
 const {b,travel}=fixture(t);const goal=new Vec3(31.5,65,.5),path=groundPath(b,b.entity.position,goal,travel.groundOptions());assert(path.reached);assert.equal(path.length,31);assert.equal(path.placements,0);
});
test('a solid wall 20 blocks away is rejected before walking around a partial route',async t=>{
 const {b,set,travel}=fixture(t,{physics:true});for(let z=-40;z<=40;z++)for(let y=65;y<=69;y++)set(new Vec3(20,y,z),'bedrock');const start=b.entity.position.clone();await assert.rejects(travel.walk(new Vec3(23.5,65,.5),'walk'),e=>e.code==='PATH_WAIT');assert(b.entity.position.distanceTo(start)<.05);assert.equal(b.controlState.forward,false);
});
test('mining approaches an existing ledge by falling instead of making floating stands',async t=>{
 const f=fixture(t,{physics:true}),{b,w,set}=f;b.entity.position=new Vec3(.5,85,.5);set(new Vec3(0,84,0),'stone');b.items[5]={...f.item('cobblestone'),count:64};const position=new Vec3(4,65,0);set(position,'obsidian');w.running=true;w.miner.layer=65;const target=b.blockAt(position);await w.approach(target);assert(b.entity.onGround);assert.equal(b.entity.position.y,65);assert(b.reach(target)&&b.visible(target));assert.equal(Object.keys(w.state.owned).length,0);assert.equal(w.approachPlan.placements,0);
});
test('all reachable real-ground stances are considered before a floating scaffold stance',async t=>{
 const f=fixture(t,{physics:true}),{b,w,set}=f;for(let x=1;x<=3;x++)for(let z=-1;z<=1;z++)set(new Vec3(x,64,z),'air');const position=new Vec3(7,65,0);set(position,'obsidian');b.items[5]={...f.item('cobblestone'),count:64};w.running=true;w.miner.layer=65;await w.approach(b.blockAt(position));assert.equal(w.approachPlan.placements,0);assert.equal(Object.keys(w.state.owned).length,0);
});
test('ten workers can assist one upper chunk with separate target reservations',t=>{
 const f=fixture(t),workers=[f.w],{b,set}=f;f.w.state.area={x1:2,z1:0,x2:13,z2:0};f.w.state.ceiling=68;f.w.manager.assigned=require('../src/manager').Manager.prototype.assigned;
 for(let x=2;x<=13;x++)set(new Vec3(x,68,0),'obsidian');
 for(let n=2;n<=10;n++){const other=fixture(t).w;other.id=n;other.manager=f.w.manager;other.state.area=f.w.state.area;other.state.ceiling=68;other.bot.blockAt=b.blockAt;other.bot.entity.position=new Vec3(-n,65,-3);other.bot.config=b.config;f.w.manager.workers.set(n,other);workers.push(other);}
 for(const w of workers)w.running=true;const selected=[];
 for(const w of workers){const target=w.chooseTarget();assert(target);assert.equal(target.position.y,68);w.miningTarget={name:target.name,position:{...target.position}};w.approachPlan={targetKey:'0:'+f.key(target.position),at:Date.now(),goal:target.position};selected.push(f.key(target.position));}
 assert.equal(new Set(selected).size,10);assert(workers.slice(1).every(w=>w.miner.assisting));assert(workers.every(w=>w.miner.layer===68));
});
test('offline bots and workers in another server do not reserve a support or a mining stripe',t=>{
 const f=fixture(t),other=fixture(t).w,{w}=f;other.id=2;other.manager=w.manager;other.bot.entity.position=new Vec3(3.5,66,.5);other.running=true;w.running=true;w.manager.workers.set(2,other);other.bot.connected=false;assert.equal(w.underPlayer(new Vec3(3,65,0)),false);other.bot.connected=true;other.bot.config={host:'different.example',port:19132};assert.equal(w.underPlayer(new Vec3(3,65,0)),false);assert(require('../src/manager').Manager.prototype.assigned.call(w.manager,w,16,0));
});
test('a miner removes its own last column from the top and falls onto the next confirmed block',async t=>{
 const f=fixture(t,{physics:true}),{b,w,set}=f;w.state.area={x1:2,z1:0,x2:2,z2:0};w.state.ceiling=68;b.entity.position=new Vec3(2.5,69,.5);b.entity.onGround=true;for(let y=65;y<=68;y++)set(new Vec3(2,y,0),'obsidian');peer(f);w.running=true;
 for(let n=0;n<30&&w.state.stats.total<4;n++){await w.tick();await sleep(70);}
 await until(()=>b.entity.onGround&&b.entity.position.y===65);assert.equal(w.state.stats.total,4);assert.equal(b.blockAt(new Vec3(2,68,0)).name,'air');assert.equal(b.blockAt(new Vec3(2,64,0)).name,'stone');assert.equal(Object.keys(w.state.owned).length,0);
});
test('falling mining workers do not dig or place blocks before landing',async t=>{
 const {b,w,set}=fixture(t);b.entity.position=new Vec3(.5,80,.5);b.entity.onGround=false;set(new Vec3(2,80,0),'obsidian');w.state.ceiling=80;w.running=true;let digs=0;b.dig=async()=>{digs++;};await w.tick();assert.equal(digs,0);assert.equal(w.miningPhase,'falling');assert.equal(w.running,true);
});
test('a stalled stance is yielded instead of keeping its target pinned indefinitely',async t=>{
 const {b,w,set}=fixture(t),position=new Vec3(9,65,0);set(position,'obsidian');w.approachPlan={targetKey:'0:9,65,0',goal:new Vec3(5.5,65,.5),at:Date.now()-15000,progressAt:Date.now()-15000,remaining:5};await assert.rejects(w.approach(b.blockAt(position)),e=>e.code==='PATH_WAIT');assert.equal(b.controlState.forward,false);
});
test('unknown-chunk exploration uses only a reachable received landing, never an unsupported center',t=>{
 const {b,w}=fixture(t),base=b.blockAt;b.blockAt=p=>p.x>=6?null:base(p);w.miner.chunk={x:1,z:0,x1:16,x2:31,z1:0,z2:15};const goal=w.miner.goal();assert(goal);assert(goal.x<6);assert(pass(b,goal.floored()));assert(b.blockAt(goal.offset(0,-1,0)).solid);assert(groundPath(b,b.entity.position,goal).reached);
});
test('scaffold and fall settings apply to every selected bot and survive a disk reload',async t=>{
 const {Store}=require('../src/store'),{Manager}=require('../src/manager'),fs=require('node:fs'),os=require('node:os'),dir=fs.mkdtempSync(os.tmpdir()+'/asira-320-');t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const store=new Store(dir),m={store,targets:()=>[1,2,3],workers:new Map(),realm:()=> '2b2e'};await Manager.prototype.execute.call(m,'all','scaffold off');await Manager.prototype.execute.call(m,'all','falllimit 96');for(const id of [1,2,3]){assert.equal(new Store(dir).bot(id).scaffoldEnabled,false);assert.equal(new Store(dir).bot(id).maxDrop,96);}await assert.rejects(Manager.prototype.execute.call(m,'all','falllimit 900'),/範囲|0|384/);assert.equal(store.bot(1).maxDrop,96);
});
test('a report saved after disconnect retains the last mining target and movement history',t=>{
 const f=fixture(t),{w,b}=f,{Manager}=require('../src/manager'),{ControlPanel}=require('../src/panel'),m=w.manager;m.names=new Map([[1,'Test Bot']]);m.logs=new Map();m.targets=()=>[1];m.trace=()=>{};w.miningTarget={name:'obsidian',position:{x:4,y:68,z:0}};w.runtime.snapshot=()=>({paused:false});w.runtime.debug={report:()=>({samples:[{position:{...b.entity.position}}]})};Manager.prototype.rememberDiagnostic.call(m,1);assert(m.disconnectedReports?.get(1));b.entity.position.y=12;m.workers.delete(1);const saved=new ControlPanel(m,'1343843235252146219').diagnostic({target:'1'}).bots[0];assert.equal(saved.recordedState,true);assert.equal(saved.mode,'offline');assert.equal(saved.position.y,65);assert.equal(saved.mining.target.name,'obsidian');assert.equal(saved.debug.samples[0].position.y,65);assert(saved.recordedAt);
});
