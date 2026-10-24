'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3');
const {fixture,peer}=require('./helpers/mining-world'),{BedrockBot}=require('../src/bedrock'),speed=require('../src/mining-speed');
const block=(b,name)=>({...b.registry.blocksByName[name],name});
function pick(f,name='netherite_pickaxe',efficiency=0){const raw=f.item(name,20);if(efficiency)raw.extra={nbt:{type:'compound',name:'',value:{ench:{type:'list',value:{type:'compound',value:[{id:{type:'short',value:15},lvl:{type:'short',value:efficiency}}]}}}}};return {name,raw,slot:1};}
test('the report case no longer computes 75.1 seconds for netherite blocks',t=>{
 const f=fixture(t),{b}=f,tool=pick(f),target=block(b,'netherite_block'),ms=BedrockBot.prototype.breakTime.call(b,target,tool);assert.equal(ms,8450);assert.equal(speed.estimate(b,target,tool).baseSpeed,9);assert(ms<10000);
});
test('real Bedrock Efficiency NBT shortens both netherite-block and obsidian mining',t=>{
 const f=fixture(t),tool=pick(f,'netherite_pickaxe',5);assert.equal(f.b.nbt(tool.raw).ench[0].lvl,5);for(const name of ['netherite_block','obsidian','crying_obsidian']){const target=block(f.b,name),result=speed.estimate(f.b,target,tool);assert.equal(result.ms,2250);assert.equal(result.efficiency,5);assert.equal(result.harvestable,true);}
});
test('all bundled incorrect material tags use a real pickaxe multiplier rather than bare-hand speed',t=>{
 const f=fixture(t),list=Object.values(f.b.registry.blocksByName).filter(x=>/incorrect_for_/.test(x.material));assert(list.length>100);for(const b of list){const p=speed.estimate(f.b,b,pick(f));assert.equal(p.baseSpeed,9,b.name);assert(Number.isFinite(p.ms),b.name);assert(p.harvestable,b.name);}
});
test('quartz, ore, metal and wooden blocks use their material category independently of their names',t=>{
 const f=fixture(t);for(const name of ['quartz_block','diamond_block','iron_block','iron_ore','end_stone'])assert.equal(speed.estimate(f.b,block(f.b,name),pick(f)).baseSpeed,9,name);f.b.items[5]=f.item('netherite_axe');assert.equal(f.b.miningTool(block(f.b,'oak_planks')).name,'netherite_axe');assert.equal(speed.estimate(f.b,block(f.b,'oak_planks'),pick(f)).baseSpeed,1);
});
test('tool names remain valid after server item-network IDs change',t=>{
 const f=fixture(t),target=block(f.b,'netherite_block'),raw={...f.item('netherite_pickaxe'),network_id:99999};assert.equal(speed.estimate(f.b,target,{name:'netherite_pickaxe',raw}).baseSpeed,9);assert.equal(speed.estimate(f.b,target,{name:'netherite_pickaxe',raw}).harvestable,true);
});
test('insufficient pickaxe tiers do not silently destroy valuable blocks without drops',async t=>{
 const f=fixture(t),p=new Vec3(2,65,0);f.set(p,'netherite_block');f.b.items[1]=f.item('iron_pickaxe');await assert.rejects(f.b.dig(f.b.blockAt(p)),/適した採掘道具/);assert(!f.packets.some(p=>p.name==='inventory_transaction'));assert.equal(f.b.blockAt(p).name,'netherite_block');
});
test('water, airborne mining, Haste and fatigue affect the real estimate and bedrock stays unbreakable',t=>{
 const f=fixture(t),{b}=f,target=block(b,'netherite_block'),tool=pick(f),normal=speed.estimate(b,target,tool).ms;b.entity.onGround=false;assert(speed.estimate(b,target,tool).ms>normal*4);b.entity.onGround=true;b.effects.set(3,{amplifier:1,expires:Date.now()+10000});assert(speed.estimate(b,target,tool).ms<normal);b.effects.clear();b.effects.set(4,{amplifier:0,expires:Date.now()+10000});assert(speed.estimate(b,target,tool).ms>normal*3);b.effects.clear();const at=b.blockAt;b.blockAt=p=>Math.floor(p.y)===66?{name:'water'}:at(p);assert(speed.estimate(b,target,tool).ms>normal*4);assert.equal(speed.estimate(b,block(b,'bedrock'),tool).ms,Infinity);
});
test('scaffold stacks are dismantled from the top without incrementing mined-block totals',async t=>{
 const f=fixture(t),{b,w,set}=f;for(const y of [65,66]){const p=new Vec3(2,y,0);set(p,'cobblestone');w.recordOwned(p,'scaffold','cobblestone');}const sent=peer(f);await w.cleanup();assert.equal(b.blockAt(new Vec3(2,66,0)).name,'air');assert.equal(b.blockAt(new Vec3(2,65,0)).name,'cobblestone');await w.cleanup();assert.equal(b.blockAt(new Vec3(2,65,0)).name,'air');assert.equal(sent.length,2);assert.equal(w.state.stats.total,0);assert.equal(Object.keys(w.state.owned).length,0);
});
test('an unused scaffold within two blocks is recovered instead of being skipped forever',async t=>{
 const f=fixture(t),p=new Vec3(1,65,0);f.set(p,'cobblestone');f.w.recordOwned(p,'scaffold','cobblestone');peer(f);await f.w.cleanup();assert.equal(f.b.blockAt(p).name,'air');
});
test('cleanup first walks off its own support, then actually breaks it on the server',async t=>{
 const f=fixture(t,{physics:true}),{w,b,set}=f,p=new Vec3(0,64,0);set(p,'cobblestone');w.recordOwned(p,'scaffold','cobblestone');peer(f);for(let n=0;n<7&&w.owned(p);n++)await w.cleanup(undefined,{finish:true});assert.equal(w.owned(p),undefined);assert.equal(b.blockAt(p).name,'air');assert(b.entity.position.x>1||Math.abs(b.entity.position.z-.5)>1);assert.equal(w.state.stats.total,0);
});
test('cleanup preserves another player support and the scaffold carrying a chest',async t=>{
 const f=fixture(t),p=new Vec3(2,64,0);f.set(p,'cobblestone');f.w.recordOwned(p,'scaffold','cobblestone');f.b.actors.set('20',{player:true,dimension:0,position:new Vec3(2.5,65,.5)});peer(f);await f.w.cleanup();assert.equal(f.b.blockAt(p).name,'cobblestone');f.b.actors.clear();f.w.recordOwned(p.offset(0,1,0),'ender_chest','ender_chest');f.set(p.offset(0,1,0),'ender_chest');await f.w.cleanup();assert.equal(f.b.blockAt(p).name,'cobblestone');
});
test('server rejection of scaffold removal keeps its ownership record and retries without declaring success',async t=>{
 const f=fixture(t),p=new Vec3(1,65,0);f.set(p,'cobblestone');f.w.recordOwned(p,'scaffold','cobblestone');f.b.dig=async()=>{throw Error('server rejected');};const status=await f.w.cleanup();assert.equal(status.phase,'retry');assert(f.w.owned(p));assert.equal(f.w.state.stats.total,0);
});
test('mining completion includes scaffold removal and explicit stop cancels further cleanup',async t=>{
 const f=fixture(t),p=new Vec3(1,65,0);f.set(p,'cobblestone');f.w.recordOwned(p,'scaffold','cobblestone');peer(f);f.w.running=true;f.w.chooseTarget=()=>{f.w.miner.done=true;return null;};await f.w.tick();assert.equal(f.w.cleanupRequested,true);await f.w.tick();assert.equal(f.w.running,false);assert.equal(f.w.mode,'stopped');assert.equal(f.b.blockAt(p).name,'air');f.w.requestCleanup();f.w.stop();assert.equal(f.w.cleanupRequested,false);
});
test('a stuck edge is temporarily avoided so the next walking plan can take a different route',async t=>{
 const f=fixture(t,{physics:true}),{b,travel}=f,original=b.waitUntil.bind(b);b.waitUntil=async()=>{throw Object.assign(Error('stuck'),{code:'PATH_WAIT'});};await assert.rejects(travel.walk(new Vec3(4.5,65,.5),'walk'),/stuck/);assert(travel.edgeBlocked(new Vec3(0,65,0),new Vec3(1,65,0)));b.waitUntil=original;await travel.walk(new Vec3(4.5,65,.5),'walk');assert(Math.abs(b.entity.position.z-.5)>.3,'next step must detour around the failed edge');
});
test('top-down mining moves away from its final supporting block instead of waiting forever',async t=>{
 const f=fixture(t,{physics:true}),{b,w,set}=f,target=new Vec3(0,65,0);b.entity.position=new Vec3(.5,66,.5);b.entity.onGround=true;set(target,'obsidian');w.state.area={x1:0,z1:0,x2:0,z2:0};w.state.ceiling=65;w.running=true;w.mode='running';peer(f);for(let n=0;n<10&&b.blockAt(target).name!=='air';n++)await w.tick();assert.equal(b.blockAt(target).name,'air');assert.equal(w.state.stats.obsidian,1);assert(b.entity.position.distanceTo(new Vec3(.5,66,.5))>.8);
});
test('repeated server corrections back off and preserve mining intent until the user stops',t=>{
 const f=fixture(t),{Worker}=require('../src/worker'),state=f.w.state,manager={store:{bot:()=>state,save(){}},workers:new Map(),claims:new Map(),notice(){},assigned:()=>true};const w=new Worker(manager,1,f.b);manager.workers.set(1,w);clearInterval(w.timer);for(const timer of [w.runtime.timer,w.runtime.motionTimer,w.runtime.combatTimer])clearInterval(timer);t.after(()=>{w.stop();w.runtime.destroy();});w.start();for(let n=0;n<6;n++)f.b.emit('forcedMove');assert.equal(w.running,true);assert(w.miningRetryAt>Date.now());assert.equal(w.miningPhase,'repath');w.stop();f.b.emit('forcedMove');assert.equal(w.running,false);
});
