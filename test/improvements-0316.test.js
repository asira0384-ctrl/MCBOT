'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{setTimeout:delay}=require('node:timers/promises'),{Vec3}=require('vec3');
const {adapter}=require('./helpers/adapter'),{Travel}=require('../src/travel'),{Worker}=require('../src/worker'),{ChunkMining}=require('../src/mining');
function fixture(t,{physics=false}={}){
 const f=adapter(t),{b,c,packets,item}=f,cells=new Map(),key=p=>`${Math.floor(p.x)},${Math.floor(p.y)},${Math.floor(p.z)}`;
 b.blockAt=p=>{p=new Vec3(p.x,p.y,p.z).floored();const name=cells.get(key(p))||(p.y===64?'stone':'air'),solid=name!=='air',entry=b.registry.blocksByName[name];return {name,position:p,stateId:entry.defaultState,solid,isAir:!solid,isLiquid:false,boundingBox:solid?'block':'empty',shapes:solid?[[0,0,0,1,1,1]]:[],diggable:entry.diggable!==false,hardness:entry.hardness??1};};
 const set=(p,name)=>{cells.set(key(p),name);b.emit('worldUpdate',p);};
 b.entity.position=new Vec3(.5,65,.5);b.entity.velocity=new Vec3(0,0,0);b.entity.onGround=true;b.health=20;b.terrainReady=true;b.terrainEstablished=true;b.serverAuthoritativeInventory=false;b.items[1]=item('netherite_pickaxe',11);b.breakTime=()=>60;
 const zero=()=>({total:0,obsidian:0,other:0,byBlock:{}}),manager={workers:new Map(),claims:new Map(),assigned:()=>true,store:{save(){}},notice(){}},w=Object.assign(Object.create(Worker.prototype),{id:1,bot:b,manager,state:{floor:64,ceiling:68,area:{x1:-10,z1:-10,x2:12,z2:12},scaffold:'cobblestone',owned:{},miningFilter:[],stats:zero(),session:zero(),minedItems:[]},running:false,busy:false,mode:'stopped',failed:new Map(),missing:'',lastEat:0});
 manager.workers.set(1,w);w.miner=new ChunkMining(w);const r={bot:b,worker:w,manager,config:{anticrystal:false,blockReach:5},paused:false,notice(){},protectAnti:()=>false};r.travel=new Travel(r);w.runtime=r;t.after(()=>w.miner.destroy());
 if(physics){b.physicsEnabled=true;b.emit('spawn');}
 return {...f,cells,set,key,w,r,travel:r.travel};
}
function peer(f,{modern=false,confirm=true}={}){
 const {b,c,packets,set}=f,queue=c.queue.bind(c),breaks=[];b.serverBreak=true;b.serverAuthoritativeInventory=modern;
 c.queue=(name,data)=>{const result=queue(name,data),p=packets.at(-1);if(name==='inventory_transaction'&&data.transaction?.transaction_data?.action_type==='break_block'){
  breaks.push(p);if(confirm)queueMicrotask(()=>set(new Vec3(...['x','y','z'].map(k=>data.transaction.transaction_data.block_position[k])),'air'));
 }if(modern&&name==='player_auth_input'&&p?.params.block_action?.some(a=>a.action==='predict_break')){
  assert(p.params.item_stack_request,'prediction must carry its durability request in the same input');const action=p.params.block_action.find(a=>a.action==='predict_break');breaks.push(p);if(confirm)queueMicrotask(()=>set(new Vec3(action.position.x,action.position.y,action.position.z),'air'));
 }return result;};return breaks;
}
test('Nukkit-style inventory sends start, a real break transaction and stop, even with the server-break toggle set',async t=>{
 const f=fixture(t),{b,set,packets}=f,target=new Vec3(2,65,0);set(target,'obsidian');const sent=peer(f);await b.dig(b.blockAt(target));assert.equal(sent.length,1);assert.equal(b.digState.confirmed,true);assert.equal(b.name(sent[0].params.transaction.transaction_data.held_item),'netherite_pickaxe');assert(packets.find(p=>p.name==='player_action'&&p.params.action==='start_break'));assert(packets.find(p=>p.name==='player_action'&&p.params.action==='stop_break'));assert.equal(b.mining,null);assert.equal(b.actionHandBusy,false);
});
test('authoritative mining sends prediction and mine-block request through real serialized physics input',async t=>{
 const f=fixture(t,{physics:true}),{b,set,packets}=f,target=new Vec3(2,65,0);set(target,'obsidian');const sent=peer(f,{modern:true});await b.dig(b.blockAt(target));assert.equal(sent.length,1);const p=sent[0].params;assert.equal(p.item_stack_request.actions[0].type_id,'mine_block');assert.equal(p.item_stack_request.actions[0].network_id,11);assert.equal(p.item_stack_request.actions[0].hotbar_slot,1);assert.equal(b.digState.confirmed,true);const actions=packets.filter(p=>p.name==='player_auth_input').flatMap(p=>p.params.block_action||[]).map(a=>a.action);assert(actions.indexOf('start_break')>=0);assert(actions.indexOf('predict_break')>actions.indexOf('start_break'));assert(!packets.some(p=>p.name==='inventory_transaction'&&p.params.transaction?.transaction_data?.action_type==='break_block'));
});
test('cancelling a dig releases its hand and never sends a delayed break after cancellation',async t=>{
 const f=fixture(t),{b,set,packets}=f,target=new Vec3(2,65,0);set(target,'obsidian');peer(f,{confirm:false});b.breakTime=()=>1000;const controller=new AbortController(),pending=b.dig(b.blockAt(target),controller.signal);setTimeout(()=>controller.abort(),100);await assert.rejects(pending,/停止/);const before=packets.length;await delay(120);assert.equal(packets.length,before);assert.equal(b.actionHandBusy,false);assert.equal(b.mining,null);assert.equal(b.blockAt(target).name,'obsidian');assert(!b.digState.confirmed);
});
test('a peer that never confirms destruction leaves the real block intact and reports unconfirmed',async t=>{
 const f=fixture(t),{b,set}=f,target=new Vec3(2,65,0);set(target,'obsidian');peer(f,{confirm:false});await assert.rejects(b.dig(b.blockAt(target),undefined,undefined,{timeout:200}),/タイムアウト/);assert.equal(b.blockAt(target).name,'obsidian');assert.equal(b.digState.phase,'unconfirmed');assert.equal(b.actionHandBusy,false);
});
for(const version of ['1.21.2','1.26.51'])test(`mining action order and prediction round-trip against ${version} without overwriting start`,()=>{
 const {adaptInput,request}=require('../src/protocol'),{action}=require('../src/digging'),{createSerializer,createDeserializer}=require('bedrock-protocol/src/transforms/serializer'),bot={registry:require('prismarine-registry')('bedrock_'+version),controlState:{},tick:1};
 action(bot,'start_break',{x:2,y:65,z:0},4,false);action(bot,'continue_break',{x:2,y:65,z:0},4,false);action(bot,'predict_break',{x:2,y:65,z:0},4,false);bot.pendingMiningRequest=request(-10,[{type_id:'mine_block',legacy_type_id:9,hotbar_slot:1,predicted_durability:1,network_id:11}]).requests[0];
 const p=adaptInput(bot,{pitch:0,yaw:0,head_yaw:0,position:{x:.5,y:66.62,z:.5},move_vector:{x:0,y:0},input_data:0n,tick:1n,delta:{x:0,y:0,z:0}}),s=createSerializer(version),d=createDeserializer(version),decoded=d.parsePacketBuffer(s.createPacketBuffer({name:'player_auth_input',params:p})).data.params;assert.deepEqual(decoded.block_action.map(a=>a.action),['start_break','continue_break','predict_break']);assert.equal(decoded.item_stack_request.actions[0].type_id,'mine_block');assert.equal(bot.pendingMiningRequest,null);assert.equal(bot.pendingBreakActions.length,0);
});
test('an adjacent one-block jump completes through real collision physics after the feet enter the destination cell',async t=>{
 const {b,set,travel}=fixture(t,{physics:true});set(new Vec3(1,65,0),'obsidian');await travel.walk(new Vec3(1.5,66,.5),'walk');assert(Math.abs(b.entity.position.x-1.5)<.23);assert(Math.abs(b.entity.position.y-66)<.25);assert.equal(travel.walking,null);assert.equal(b.controlState.jump,false);
});
test('walking within the same grid cell still reaches the requested point instead of waiting on an empty A-star path',async t=>{
 const {b,travel}=fixture(t,{physics:true});b.entity.position.x=1.05;await travel.walk(new Vec3(1.5,65,.5),'walk');assert(Math.abs(b.entity.position.x-1.5)<.23);assert.equal(travel.walking,null);
});
test('newly received obstacles cancel the current step and replan rather than walking into them',async t=>{
 const {b,set,travel}=fixture(t,{physics:true}),pending=travel.walk(new Vec3(4.5,65,.5),'walk');set(new Vec3(1,65,0),'obsidian');await assert.rejects(pending,/障害物/);assert(b.entity.position.x<.8);assert.equal(b.controlState.forward,false);
});
test('mining walks to a clear stance, stops on reach and confirms the target with the selected pickaxe',async t=>{
 const f=fixture(t,{physics:true}),{b,w,set}=f,target=new Vec3(7,65,0);w.state.area={x1:7,z1:0,x2:7,z2:0};w.state.ceiling=65;w.running=true;w.mode='running';set(target,'obsidian');peer(f);for(let n=0;n<12&&b.blockAt(target).name!=='air';n++)await w.tick();assert.equal(b.blockAt(target).name,'air');assert.equal(w.state.stats.obsidian,1);assert.equal(w.state.stats.total,1);assert(b.entity.position.x<7,'stance must not be inside the mined block');assert.equal(b.digState.confirmed,true);assert.equal(w.miningPhase,'confirmed');
});
test('a visible target on the current layer is chosen before a nearer occluded target',t=>{
 const {b,w,set}=fixture(t),a=new Vec3(2,65,0),c=new Vec3(3,65,0);w.state.area={x1:2,z1:0,x2:3,z2:0};w.state.ceiling=65;set(a,'obsidian');set(c,'obsidian');b.reach=()=>true;b.visible=block=>block.position.x===3;assert.equal(w.miner.scan().position.x,3);
});
test('an unowned shallow floor overlap can jump out without an old Anti anchor or matching correction coordinates',async t=>{
 const {b,travel}=fixture(t,{physics:true});b.entity.position.y=64.65;b.entity.onGround=false;assert.equal(travel.prepareFloorEscape(),true);const start=b.entity.position.y;await delay(220);assert(b.entity.position.y>start);assert.equal(require('../src/positions').inspect(b,b.entity.position).overlaps.length,0);assert.equal(travel.embed,null);
});
test('deep overlap is removed by actually mining the authorized obstruction without teleporting or changing Anti',async t=>{
 const f=fixture(t),{b,w,set,travel,r}=f,target=new Vec3(0,66,0);w.running=true;w.state.miningFilter=['obsidian'];w.miner.layer=66;set(target,'obsidian');peer(f);const before=b.entity.position.clone();assert.equal(await travel.recoverCollision(),true);assert.equal(b.blockAt(target).name,'air');assert.deepEqual(b.entity.position,before);assert.equal(w.state.stats.obsidian,1);assert.equal(r.config.anticrystal,false);assert.equal(travel.collisionRecovery.phase,'recheck');
});
test('overlap recovery respects the protected floor and selective mining filter',async t=>{
 const f=fixture(t),{b,w,set,travel}=f;w.running=true;w.state.miningFilter=['obsidian'];w.miner.layer=65;set(new Vec3(0,66,0),'stone');let digs=0;b.dig=async()=>{digs++;};await travel.recoverCollision();assert.equal(digs,0);assert.equal(travel.collisionRecovery.phase,'blocked');assert.match(travel.collisionRecovery.reason,/範囲/);w.state.floor=66;w.state.miningFilter=[];await travel.recoverCollision();assert.equal(digs,0);
});
test('combat-protected Anti and an idle lobby never start emergency digging',async t=>{
 const f=fixture(t),{b,w,set,travel,r}=f;set(new Vec3(0,66,0),'obsidian');let digs=0;b.dig=async()=>{digs++;};assert.equal(await travel.recoverCollision(),false);w.running=true;r.protectAnti=()=>true;const before=b.entity.position.clone();assert.equal(await travel.recoverCollision(),false);assert.equal(digs,0);assert.deepEqual(b.entity.position,before);
});
test('inventory maintenance does not open a screen while the mining hand is active',async t=>{
 const {b}=fixture(t),{Runtime}=require('../src/runtime');b.mining={x:2,y:65,z:0};let opened=0;b.openInventory=async()=>opened++;await Runtime.prototype.equipmentPulse.call({bot:b,equipmentBusy:false,destroyed:false,restock:{running:false}});assert.equal(opened,0);
});
test('tiny lateral wall rounding is repaired but a fully embedded body is not teleported across a block',t=>{
 const {b,set}=fixture(t),{guardPenetration}=require('../src/positions');set(new Vec3(1,65,0),'obsidian');b.entity.position.x=.75;assert.equal(guardPenetration(b),false);assert(Math.abs(b.entity.position.x-.7)<1e-6);assert.equal(b.collisionState.roundedFromWall,true);b.entity.position.x=1.5;const before=b.entity.position.clone();assert.equal(guardPenetration(b),true);assert.deepEqual(b.entity.position,before);
});
test('confirmed all-air refresh clears a former solid section and old overrides, resolving ghost blocks',async t=>{
 const {b}=adapter(t),w=b.worldMirror,p=new Vec3(2,66,0),Block=require('prismarine-block')(w.registry),column=w.column(0,0);column.setBlock({x:2,y:66,z:0,l:0},Block.fromStateId(w.registry.blocksByName.obsidian.defaultState));w.known.add('0,4,0');w.update({position:p,block_runtime_id:w.wireIds.get(w.registry.blocksByName.obsidian.defaultState)});assert.equal(w.get(p).name,'obsidian');w.request(0,0,4,4,{force:true});await w.subchunk({origin:{x:0,y:0,z:0},entries:[{dx:0,dy:4,dz:0,result:'success_all_air'}]});assert.equal(w.get(p).name,'air');assert(!w.overrides.has('2,66,0'));
});
test('a fresh block update received after a refresh request wins over the older section snapshot',async t=>{
 const {b}=adapter(t),w=b.worldMirror,p=new Vec3(2,66,0);w.column(0,0);w.known.add('0,4,0');w.request(0,0,4,4,{force:true});w.update({position:p,block_runtime_id:w.wireIds.get(w.registry.blocksByName.obsidian.defaultState)});await w.subchunk({origin:{x:0,y:0,z:0},entries:[{dx:0,dy:4,dz:0,result:'success_all_air'}]});assert.equal(w.get(p).name,'obsidian');
});
test('a rejected refresh does not invent air or discard an occupied solid block',async t=>{
 const {b}=adapter(t),w=b.worldMirror,p=new Vec3(2,66,0);w.column(0,0);w.known.add('0,4,0');w.update({position:p,block_runtime_id:w.wireIds.get(w.registry.blocksByName.obsidian.defaultState)});w.request(0,0,4,4,{force:true});await w.subchunk({origin:{x:0,y:0,z:0},entries:[{dx:0,dy:4,dz:0,result:'chunk_not_found'}]});assert.equal(w.get(p).name,'obsidian');assert(w.overrides.has('2,66,0'));
});
