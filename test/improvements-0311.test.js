'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {Vec3}=require('vec3'),{adapter}=require('./helpers/adapter'),{Runtime}=require('../src/runtime');
const {inHole}=require('../src/combat'),{claim,release}=require('../src/hand');
const air=p=>({name:'air',position:new Vec3(p.x,p.y,p.z).floored(),solid:false,isAir:true,boundingBox:'empty',shapes:[],stateId:0});
const block=(p,name='obsidian')=>({...air(p),name,solid:true,isAir:false,boundingBox:'block',shapes:[[0,0,0,1,1,1]],stateId:1});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn){for(let n=0;!fn();n++){assert(n<500,'condition timed out');await delay(2);}}
function fixture(t,config={}){
 const a=adapter(t),state={runtime:{gear:false,autototem:false,autoslot:false,heal:false,autolog:false,...config},combatRevision:38,tacticsRevision:38,autoSupply:false,respawn:true,owned:{},minedItems:[]};
 const manager={names:new Map([[1,'Aslrq6th']]),workers:new Map(),store:{data:{enemies:[{name:'Enemy'}],friends:[]},save(){}},notice(){}};
 const w={id:1,manager,bot:a.b,state,mode:'stopped',stop(){a.b.halt();},running:false,busy:false},r=w.runtime=new Runtime(w);manager.workers.set(1,w);
 clearInterval(r.combatTimer);clearInterval(r.motionTimer);clearInterval(r.timer);r.wakeCombat=()=>{};
 const b=a.b;b.health=20;b.terrainReady=true;b.terrainEstablished=true;b.entity.position=new Vec3(.5,64,.5);b.entity.onGround=true;b.blockAt=p=>Math.floor(p.y)===63?block(p):air(p);
 const enemy={id:13n,name:'Enemy',player:true,dimension:0,position:new Vec3(3.5,64,.5),seen:Date.now()};b.actors.set('13',enemy);t.after(()=>r.destroy());return {...a,r,w,manager,enemy};
}
test('Nukkit AddPlayer and MoveActor feet positions stay consistent with eye-based MovePlayer and partial deltas',t=>{
 const {b,c}=fixture(t);c.emit('add_player',{runtime_id:30n,username:'Other',position:{x:3.5,y:63.45,z:.5}});const actor=b.actors.get('30');
 assert.equal(actor.position.y,63.45);assert.equal(actor.positionFrame,'feet');
 c.emit('move_player',{runtime_id:30n,mode:'normal',position:{x:3.5,y:65.07,z:.5}});assert(Math.abs(actor.position.y-63.45)<1e-6);
 c.emit('move_entity',{runtime_entity_id:30n,position:{x:3.5,y:63.45,z:.5}});assert.equal(actor.position.y,63.45);assert.equal(actor.positionFrame,'feet');
 c.emit('move_entity_delta',{runtime_entity_id:30n,x:4.5});assert.equal(actor.position.y,63.45);assert.equal(actor.rawPosition.y,63.45);
 c.emit('move_entity_delta',{runtime_entity_id:30n,y:64});assert.equal(actor.position.y,64);assert.equal(actor.position.x,4.5);
 c.emit('move_player',{runtime_id:30n,mode:'rotation',position:{x:999,y:999,z:999}});assert.equal(actor.position.y,64);
 c.emit('add_entity',{runtime_id:80n,entity_type:'minecraft:ender_crystal',position:{x:6.5,y:64,z:2.5}});
 c.emit('move_entity_delta',{runtime_entity_id:80n,x:5.5});assert.equal(b.actors.get('80').position.y,64);
});
test('per-actor terrain proof can recognize an eye-offset fork without changing other players or double-subtracting a delta',t=>{
 const {b,c}=fixture(t);c.emit('add_player',{runtime_id:30n,username:'EyeFork',position:{x:3.5,y:65.62,z:.5}});const a=b.actors.get('30');assert.equal(a.position.y,64);assert.equal(a.positionFrame,'eye');
 c.emit('move_entity',{runtime_entity_id:30n,position:{x:4.5,y:65.62,z:.5}});assert.equal(a.position.y,64);assert.equal(a.positionFrame,'eye');
 c.emit('move_entity_delta',{runtime_entity_id:30n,z:1.5});assert.equal(a.position.y,64);assert.equal(a.rawPosition.y,65.62);
 c.emit('add_player',{runtime_id:31n,username:'Feet',position:{x:5.5,y:63.45,z:.5}});assert.equal(b.actors.get('31').position.y,63.45);
});
test('KA selects and settles a sword before attacking while CA continues its place/break cycle',async t=>{
 const {b,c,r,item,enemy}=fixture(t,{killaura:true,crystalaura:true,crystalPredict:0});b.items[0]=item('netherite_sword');b.items[6]={...item('end_crystal'),count:64};
 const trace=[],queue=c.queue;let selected=-1,selectedAt=0,nextId=100n;
 c.queue=(name,p)=>{queue(name,p);if(name==='mob_equipment'){selected=p.selected_slot;selectedAt=Date.now();}if(name!=='inventory_transaction')return;const tx=p.transaction,d=tx.transaction_data;
  if(tx.transaction_type==='item_use_on_entity'){
   if(d.entity_runtime_id===enemy.id){assert.equal(selected,0);assert(Date.now()-selectedAt>=45,'sword must leave the selection batch before melee');trace.push('melee');}
   else{trace.push('break');queueMicrotask(()=>c.emit('remove_entity',{entity_id_self:d.entity_runtime_id}));}
  }else if(d?.action_type==='click_block'&&b.name(d.held_item)==='end_crystal'){trace.push('place');const id=nextId++;queueMicrotask(()=>c.emit('add_entity',{runtime_id:id,unique_id:id,entity_type:'minecraft:ender_crystal',position:new Vec3(d.block_position.x+.5,d.block_position.y+1,d.block_position.z+.5)}));}
 };
 await r.combatPulse();await delay(80);await r.combatPulse();await delay(80);await r.combatPulse();
 assert.deepEqual(trace,['melee','place','melee','break','melee','place']);assert.equal(r.attacks,3);
});
function pistonServer(t,{mode='look',learn=false,nukkit=false,push=true}={}){
 const f=fixture(t,{killaura:true,crystalaura:true,pistoncrystal:true,crystalPredict:0}),{b,c,r,item,enemy,packets}=f;enemy.position=new Vec3(4.5,64,.5);b.entity.position=new Vec3(1,64,-1.5);const hole=enemy.position.floored(),Block=require('prismarine-block')(b.registry),faces=[[0,-1,0],[0,1,0],[0,0,-1],[0,0,1],[-1,0,0],[1,0,0]];
 b.items[0]=item('netherite_sword');b.items[1]=item('netherite_pickaxe');b.items[5]=item('obsidian');b.items[6]=item('end_crystal');b.items[7]=item('piston');b.items[8]=item('redstone_block');if(!learn)b.pistonFacingMode=mode;b.serverBreak=false;
 const walls=p=>Math.floor(p.y)===63||Math.floor(p.y)===64&&[[1,0],[-1,0],[0,1],[0,-1]].some(([x,z])=>Math.floor(p.x)===hole.x+x&&Math.floor(p.z)===hole.z+z);
 b.blockAt=p=>b.worldMirror.overrides.has(`${Math.floor(p.x)},${Math.floor(p.y)},${Math.floor(p.z)}`)?b.worldMirror.get(p):walls(p)?block(p):air(p);
 if(nukkit){b.serverAuthoritativeInventory=false;b.pistonFacingMode='opposite';b.pistonWireOpposite=true;}const trace=[],yawPackets=[],queue=c.queue;let serverYaw=0;
 const update=(p,name,facing)=>{const entry=b.registry.blocksByName[name];let state=entry.defaultState;if(name==='piston')for(let n=entry.minStateId;n<=entry.maxStateId;n++)if(Number(Block.fromStateId(n).getProperties().facing_direction)===facing){state=n;break;}c.emit('update_block',{position:p,block_runtime_id:b.worldMirror.wireIds.get(state)??state,layer:0});};
 c.queue=(name,p)=>{queue(name,p);if(name==='player_auth_input'){serverYaw=packets.at(-1).params.yaw;yawPackets.push(serverYaw);}if(name!=='inventory_transaction')return;const tx=p.transaction,d=tx.transaction_data;
  if(tx.transaction_type==='item_use_on_entity'){trace.push('attack:'+String(d.entity_runtime_id));return;}
  if(d?.action_type==='break_block'){trace.push('dig');queueMicrotask(()=>update(new Vec3(d.block_position.x,d.block_position.y,d.block_position.z),'air'));return;}
  if(d?.action_type!=='click_block')return;const held=b.name(d.held_item),base=new Vec3(d.block_position.x,d.block_position.y,d.block_position.z);trace.push(held);
  const quadrant=((Math.round(serverYaw/90)%4)+4)%4,looking=[3,4,2,5][quadrant],facing=mode==='look'?looking:({2:3,3:2,4:5,5:4}[looking]);
  queueMicrotask(()=>{if(held==='end_crystal')c.emit('add_entity',{runtime_id:100n,unique_id:100n,entity_type:'minecraft:ender_crystal',position:base.offset(.5,1,.5)});else{const [x,y,z]=faces[d.face];update(base.offset(x,y,z),held,facing);if(held==='redstone_block'&&push)c.emit('move_entity',{runtime_entity_id:100n,position:hole.offset(.5,1,.5)});}});
 };
 b.physicsEnabled=true;b.emit('spawn');const motion=setInterval(()=>r.motionTick(),10);t.after(()=>clearInterval(motion));return {...f,trace,yawPackets,motion};
}
for(const mode of ['look','opposite'])test(`PA owns movement/camera/hands through real physics, live facing and push confirmation (${mode})`,async t=>{
 const {r,trace,yawPackets}=pistonServer(t,{mode});await r.combatPulse();assert.deepEqual(trace,['obsidian','piston','end_crystal','redstone_block','attack:100']);assert(yawPackets.length>0);assert.equal(r.attacks,0);assert.equal(r.crystals.piston.stage,'break');assert.equal(r.pistonExclusive,false);
 assert(r.crystals.pistonHistory.some(e=>e.action==='pa_pedestal_confirmed'));
});
test('PA learns the opposite Nukkit placement convention from a real facing echo, recovers its piston and retries',async t=>{
 const {b,r,w,trace,motion}=pistonServer(t,{mode:'look',learn:true});await r.combatPulse();clearInterval(motion);r.travel.stopFollowing();assert.equal(b.pistonFacingMode,'look');assert.equal(w.state.pistonFacingMode,'look');assert(trace.includes('dig'));assert(!trace.includes('redstone_block'));await delay(Math.max(0,(r.crystals.paRetryAt||0)-Date.now())+10);await r.combatPulse();assert(trace.includes('redstone_block'),JSON.stringify({trace,state:r.crystals.snapshot(),errors:r.featureErrors,waiting:r.combatWaiting}));assert(trace.includes('attack:100'));assert.equal(r.attacks,0);
});
test('a solid Anti floor is not a PA hole; CA still selects an exposed floor-level blast against a buried enemy',async t=>{
 const {b,c,r,item,enemy}=fixture(t,{crystalaura:true,pistoncrystal:true,crystalPredict:0});enemy.position.y=63.45;b.items[6]=item('end_crystal');
 assert.equal(inHole(b,enemy),false);assert.equal(r.crystals.canPiston(enemy),false);await r.crystals.tick(enemy);assert(r.crystals.pendingCrystal);assert.equal(r.crystals.placementScore.position.y,63);assert.equal(r.crystals.placementScore.targetBuried,true);assert(r.crystals.placementScore.damage>0);
 assert(c.listenerCount('move_entity')>0);
});
test('combat corrections rebase Anti on the accepted pose without unburying and chase continues',t=>{
 const {b,c,r,enemy}=fixture(t,{killaura:true,anticrystal:true});enemy.position.x=10.5;r.target=enemy;r.engagedAt=Date.now();assert(r.travel.bury(.55));r.travel.step();
 for(let n=0;n<5;n++){const x=.5+n*.2;c.emit('move_player',{runtime_id:b._runtimeEntityId,mode:'teleport',position:{x,y:65.07,z:.5}});assert(r.travel.embed);assert(Math.abs(b.entity.position.y-63.45)<1e-6);assert.equal(r.burrowBlockedUntil,0);}
 const before=b.entity.position.x;r.motionTick();r.travel.step();assert(b.entity.position.x>before);assert(r.travel.embed);assert(Math.abs(b.entity.position.y-63.45)<1e-6);assert.equal(r.travel.floorEscape,null);
 r.prioritize('crystalaura',true);assert(r.travel.embed);assert(Math.abs(b.entity.position.y-63.45)<1e-6);
 r.config.anticrystal=false;r.prioritize('anticrystal',false);assert.equal(r.travel.embed,null);assert.equal(b.entity.position.y,64);
});
test('combat never restores a stale Anti height after a distant server teleport or starts a recovery jump',t=>{
 const {b,c,r,enemy}=fixture(t,{killaura:true,anticrystal:true});r.target=enemy;r.engagedAt=Date.now();assert(r.travel.bury(.55));r.travel.step();
 c.emit('move_player',{runtime_id:b._runtimeEntityId,mode:'teleport',position:{x:60.5,y:65.62,z:60.5}});assert.equal(b.entity.position.y,64);assert.equal(r.travel.embed,null);assert.equal(r.travel.prepareFloorEscape(),false);r.travel.recoverAnti();assert.equal(b.entity.position.y,64);
 b.armor[1]={network_id:b.registry.itemsByName.elytra.id,count:1};assert.equal(r.travel.gapGoal(new Vec3(66,64,60)),null);
});
test('Anti chase packets describe the world-space move even while combat rotates the camera',t=>{
 t.mock.timers.enable({apis:['setInterval']});const {b,r,packets,enemy}=fixture(t,{killaura:true,anticrystal:true});r.target=enemy;assert(r.travel.bury(.55));r.travel.step();b.physicsEnabled=true;b.emit('spawn');
 r.travel.following={kind:'chase'};b.desiredMoveWorld={x:1,z:0};b.desiredMoveSpeed=.27;b.setControlState('forward',true);
 for(const yaw of [0,Math.PI/2,Math.PI]){b.entity.yaw=yaw;t.mock.timers.tick(50);const p=packets.filter(p=>p.name==='player_auth_input').at(-1).params;
  const ix=-p.move_vector.x,iz=-p.move_vector.y;const x=-ix*Math.cos(yaw)+iz*Math.sin(yaw),z=-ix*Math.sin(yaw)-iz*Math.cos(yaw);assert(Math.abs(x-1)<1e-6);assert(Math.abs(z)<1e-6);assert(p.delta.x>0);}
});
test('food starts as soon as a combat hand lease is released and never resends the held-slot equipment',async t=>{
 const {b,c,r,item}=fixture(t,{heal:true,killaura:true});b.health=16;b.items[2]=item('enchanted_golden_apple');b.serverAuthoritativeInventory=false;b.itemUseDurationMs=30;b.itemUseTimeoutMs=40;const lease=claim(b);assert.equal(r.startUse('体力回復',b.find('enchanted_golden_apple')),null);assert(r.pendingFood);
 const queue=c.queue;let clicks=0,equipment=0;c.queue=(name,p)=>{queue(name,p);if(name==='mob_equipment')equipment++;if(name==='inventory_transaction'&&p.transaction.transaction_data?.action_type==='click_air'&&++clicks===2)queueMicrotask(()=>c.emit('inventory_slot',{window_id:'inventory',slot:2,item:{network_id:0}}));};
 const released=Date.now();release(b,lease);await until(()=>b.usingItem);assert(Date.now()-released<150);assert.throws(()=>b.select(2,true),e=>e.code==='HAND_BUSY');await r.consumeTask;assert.equal(equipment,1);assert.equal(clicks,2);assert.equal(b.lastItemUse.attempts,1);assert.equal(r.attacks,0);
});
test('own server metadata cancellation restarts one use promptly without an extra same-slot switch',async t=>{
 const {b,c,item,packets}=adapter(t);b.serverAuthoritativeInventory=false;b.items[2]=item('enchanted_golden_apple');b.itemUseDurationMs=40;b.itemUseTimeoutMs=100;let clicks=0;const queue=c.queue;
 const flags=value=>c.emit('set_entity_data',{runtime_entity_id:b._runtimeEntityId,metadata:[{key:0,value}]});
 c.queue=(name,p)=>{queue(name,p);if(name!=='inventory_transaction'||p.transaction.transaction_data?.action_type!=='click_air')return;clicks++;if(clicks===1){queueMicrotask(()=>flags(16n));setTimeout(()=>flags(0n),10);}else if(clicks===2)queueMicrotask(()=>flags(16n));else if(clicks===3)queueMicrotask(()=>c.emit('inventory_slot',{window_id:'inventory',slot:2,item:{network_id:0}}));};
 await b.eat();assert.equal(clicks,3);assert.equal(b.lastItemUse.attempts,2);assert.equal(packets.filter(p=>p.name==='mob_equipment').length,1);assert(b.lastItemUse.durationMs<400);
});
test('Nukkit-style inventory state is closed before melee while a different slot transfer can still be confirmed',async t=>{
 const {b,c,r,item,enemy}=fixture(t,{killaura:true});b.items[0]=item('netherite_sword');b.items[15]=item('dirt');c.stackDelayMs=250;const queue=c.queue,trace=[];let serverOpen=false;
 c.queue=(name,p)=>{queue(name,p);if(name==='interact'&&p.action_id==='open_inventory')serverOpen=true;if(name==='container_close'){serverOpen=false;trace.push('close');}if(name==='inventory_transaction'&&p.transaction.transaction_type==='item_use_on_entity'){assert.equal(serverOpen,false,'Nukkit would reject this attack with the screen open');trace.push('attack');}};
 const transfer=b.swap(15,16);await until(()=>b.pendingStackRequest);assert(serverOpen);await r.performMelee(enemy);assert(b.pendingStackRequest);assert.deepEqual(trace,['close','attack']);await transfer;assert.equal(b.name(b.items[16]),'dirt');assert.equal(b.lastStackResponse.status,'ok');
 await b.openInventory();assert(serverOpen);assert(b.inventoryOpen);b.closeContainer();
});
test('AutoSlot protects a combat-held stack and resumes the deferred move after the action lease ends',async t=>{
 const {b,item}=adapter(t),equipment=require('../src/equipment');b.items[1]=item('end_crystal');b.select(1);const lease=claim(b);
 assert.equal(await equipment.autoSlots(b),false);assert.equal(b.name(b.items[1]),'end_crystal');assert.equal(b.items[6],null);release(b,lease);
 assert.equal(await equipment.autoSlots(b),true);assert.equal(b.name(b.items[6]),'end_crystal');assert.equal(b.items[1],null);
});
test('a corrected PA position outside block reach releases its journal so chase is not held by the stale plan',async t=>{
 const {b,r,item,enemy}=fixture(t,{killaura:true,pistoncrystal:true});enemy.position=new Vec3(4.5,64,.5);b.entity.position=new Vec3(1,64,-1.5);const hole=enemy.position.floored();b.items[6]=item('end_crystal');b.items[7]=item('piston');b.items[8]=item('redstone_block');b.items[5]=item('obsidian');
 b.blockAt=p=>Math.floor(p.y)===63||Math.floor(p.y)===64&&[[1,0],[-1,0],[0,1],[0,-1]].some(([x,z])=>Math.floor(p.x)===hole.x+x&&Math.floor(p.z)===hole.z+z)?block(p):air(p);
 const plan=r.crystals.plan(enemy);assert(plan);r.crystals.piston={...plan,hole,placed:true,power:false,stage:'crystal'};b.entity.position=new Vec3(20,64,0);await r.crystals.pistonTick(enemy);assert.equal(r.crystals.piston,null);assert.equal(r.paOwnsHand(enemy),false);assert(r.crystals.pistonHistory.some(e=>e.action==='pa_out_of_reach'));
});
test('an exhausted PA cycle releases combat ownership instead of permanently suppressing KA',async t=>{
 const {b,r,enemy}=fixture(t,{killaura:true,pistoncrystal:true});enemy.position=new Vec3(4.5,64,.5);const hole=enemy.position.floored();b.entity.position=new Vec3(1,64,-1.5);
 b.blockAt=p=>Math.floor(p.y)===63||Math.floor(p.y)===64&&[[1,0],[-1,0],[0,1],[0,-1]].some(([x,z])=>Math.floor(p.x)===hole.x+x&&Math.floor(p.z)===hole.z+z)?block(p):air(p);
 r.crystals.piston={base:b.blockAt(hole.offset(0,0,-1)),pistonPos:hole.offset(0,1,-2),powerPos:hole.offset(-1,1,-2),hole,enemyId:String(enemy.id),placed:true,power:false,stage:'break'};
 await r.crystals.pistonTick(enemy);assert.equal(r.crystals.piston,null);assert.equal(r.paOwnsHand(enemy),false);assert.match(r.crystals.state,/Crystal不足/);
});

test('Nukkit inverse piston metadata proceeds through Crystal and power, then breaks the received Crystal if entity pushing is absent',async t=>{const {r,trace}=pistonServer(t,{mode:'look',nukkit:true,push:false});await r.combatPulse();assert.deepEqual(trace,['obsidian','piston','end_crystal','redstone_block','attack:100']);assert(r.crystals.pistonHistory.some(v=>v.action==='pa_push_unconfirmed'));assert.equal(r.attacks,0);assert.equal(r.crystals.piston.stage,'break');});

test('legacy inventory does not invert already canonical piston runtime properties',async t=>{const {b,r,trace}=pistonServer(t,{mode:'opposite',nukkit:true});b.pistonWireOpposite=false;await r.combatPulse();assert.deepEqual(trace,['obsidian','piston','end_crystal','redstone_block','attack:100']);});
