'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {Vec3}=require('vec3'),{adapter}=require('./helpers/adapter'),{Runtime}=require('../src/runtime');
const {groundPath}=require('../src/navigation'),{CrystalCombat}=require('../src/combat'),{rayClear,facePoint}=require('../src/geometry');
const {claim,release}=require('../src/hand');
const air=p=>({name:'air',position:new Vec3(p.x,p.y,p.z).floored(),solid:false,isAir:true,boundingBox:'empty',shapes:[],stateId:0});
const block=(p,name='obsidian',shapes=[[0,0,0,1,1,1]])=>({...air(p),name,solid:true,isAir:false,boundingBox:'block',shapes,stateId:1});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn){for(let n=0;!fn();n++){assert(n<300,'condition timed out');await delay(2);}}
function fixture(t,config={}){
 const a=adapter(t),state={runtime:{gear:false,autototem:false,autoslot:false,heal:false,autolog:false,...config},combatRevision:38,tacticsRevision:38,autoSupply:false,respawn:true,owned:{},minedItems:[]};
 const manager={names:new Map([[1,'Aslrq6th']]),workers:new Map(),store:{data:{enemies:[{name:'Enemy'}],friends:[]},bot:()=>state,save(){}},notice(){}};
 const w={id:1,manager,bot:a.b,state,mode:'stopped',stop(){a.b.halt();},running:false,busy:false},r=w.runtime=new Runtime(w);manager.workers.set(1,w);
 a.b.health=20;a.b.entity.position=new Vec3(.5,64,.5);a.b.blockAt=air;a.b.terrainReady=true;
 const enemy={id:13n,name:'Enemy',player:true,dimension:0,position:new Vec3(3.5,64,.5),seen:Date.now()};a.b.actors.set('13',enemy);
 t.after(()=>r.destroy());return {...a,r,w,manager,enemy};
}
test('report replay: repeated 0.55m corrections and OFF recover only a recorded Anti floor, including a delayed correction',t=>{
 t.mock.timers.enable({apis:['Date'],now:100000});const {b,c,r}=fixture(t,{anticrystal:true});const x=106.48751068115234,z=74.95719909667969;
 b.blockAt=p=>Math.floor(p.y)===70?block(p):air(p);b.entity.position=new Vec3(x,71,z);b.entity.onGround=true;assert(r.travel.bury(.55));r.travel.step();
 const packet={runtime_id:b._runtimeEntityId,mode:'teleport',position:{x,y:72.07000732421875,z}};
 for(let i=0;i<5;i++){c.emit('move_player',packet);t.mock.timers.tick(50);}
 t.mock.timers.tick(300);r.travel.recoverAnti();assert.equal(b.entity.position.y,71);assert(!b.collisionState.held);
 r.config.anticrystal=false;r.travel.unbury();t.mock.timers.tick(5000);c.emit('move_player',packet);t.mock.timers.tick(300);assert(r.travel.recoverAnti());assert.equal(b.entity.position.y,71);assert.equal(r.config.anticrystal,false);
 // A server teleport to a different wall must not reuse this floor memory.
 b.entity.position=new Vec3(x+30,70.45,z);assert.equal(r.travel.recoverAnti(),false);assert.equal(b.entity.position.y,70.45);
});
test('movement compatibility sees intended walking after the earlier correction listener clears the controls',t=>{
 const {b,c,r}=fixture(t);b.terrainEstablished=true;b.advertisedMovement='未指定';b.blockAt=p=>Math.floor(p.y)===63?block(p):air(p);b.entity.onGround=true;
 r.travel.follow(new Vec3(8.5,64,.5),.27,'route',.6);
 for(let n=0;n<3;n++)c.emit('move_player',{runtime_id:b._runtimeEntityId,mode:'reset',position:{x:.5,y:65.62,z:.5}});
 assert.equal(b.walkRejections,3);assert.equal(b.legacyMovementFallback,true);
});
test('a fresh reconnect at the reported Anti depth uses a collision-checked jump even with Anti OFF',async t=>{
 t.mock.timers.enable({apis:['setInterval','Date'],now:100000});const {b,c,r}=fixture(t,{anticrystal:false});b.blockAt=p=>Math.floor(p.y)===63?block(p):air(p);b.terrainEstablished=true;b.entity.onGround=true;b.physicsEnabled=true;b.emit('spawn');
 c.emit('move_player',{runtime_id:b._runtimeEntityId,mode:'teleport',position:{x:.5,y:65.07000732421875,z:.5}});assert.equal(r.travel.antiAnchor,undefined);let previous=b.entity.position.y,maxStep=0;
 for(let i=0;i<50;i++){t.mock.timers.tick(50);maxStep=Math.max(maxStep,b.entity.position.y-previous);previous=b.entity.position.y;await Promise.resolve();}
 assert(Math.abs(b.entity.position.y-64)<1e-6);assert.equal(b.entity.onGround,true);assert.equal(r.config.anticrystal,false);assert.equal(r.travel.embed,null);assert(maxStep<=.420001);assert(!b.collisionState.held);
});
test('a reconnect jump never starts into a solid ceiling or while explicitly stopped',t=>{
 const {b,r}=fixture(t);b.entity.position=new Vec3(.5,63.45,.5);b.lastPositionNormalization={position:{x:.5,y:63.45,z:.5}};b.blockAt=p=>[63,65].includes(Math.floor(p.y))?block(p):air(p);assert.equal(r.travel.prepareFloorEscape(),false);assert.equal(r.travel.floorEscape,undefined);
 b.blockAt=p=>Math.floor(p.y)===63?block(p):air(p);r.stop();r.motionTick();assert(!r.travel.floorEscape);assert.equal(b.entity.position.y,63.45);
});
test('ground path routes around 1.5m fences and walls and explicitly jumps a clear 1m step',()=>{
 for(const name of ['oak_fence','cobblestone_wall']){
  const bot={blockAt:p=>Math.floor(p.y)===-1?block(p):Math.floor(p.x)===1&&Math.floor(p.y)===0&&Math.abs(Math.floor(p.z))<=3?block(p,name,[[.25,0,.25,.75,1.5,.75]]):air(p)};
  const path=groundPath(bot,new Vec3(0,0,0),new Vec3(3,0,0));assert(path.length);assert(path.every(n=>!(n.position.x===1&&Math.abs(n.position.z)<=3)));assert(path.at(-1).position.distanceTo(new Vec3(3,0,0))<1);
 }
 const bot={blockAt:p=>Math.floor(p.y)===-1||Math.floor(p.x)===1&&Math.floor(p.y)===0?block(p):air(p)};
 const path=groundPath(bot,new Vec3(0,0,0),new Vec3(2,0,0));assert.equal(path[0].action,'jump');assert.equal(path[0].position.y,1);
});
test('walk drives its validated jump waypoint through the real physics loop',async t=>{
 t.mock.timers.enable({apis:['setInterval']});const {b,r}=fixture(t);b.blockAt=p=>Math.floor(p.y)===63||Math.floor(p.x)===1&&Math.floor(p.y)===64?block(p):air(p);b.entity.onGround=true;b.physicsEnabled=true;b.emit('spawn');
 const walking=r.travel.walk(new Vec3(2.5,64,.5),'walk');let reached=false;walking.then(()=>{reached=true;},()=>{});
 for(let n=0;n<90&&!reached;n++){t.mock.timers.tick(50);await Promise.resolve();}
 assert(reached,JSON.stringify({position:b.entity.position,controls:b.controlState,following:r.travel.following,physics:b.physicsState}));await walking;assert(b.entity.position.x>1.1);assert(Math.abs(b.entity.position.y-65)<.25);
});
test('PA checks a complete reachable layout instead of placing the piston that blocks its own crystal click',t=>{
 const {b,r,item,enemy}=fixture(t,{pistoncrystal:true});enemy.position=new Vec3(4.5,64,.5);b.entity.position=new Vec3(1,64,-1.5);
 b.items[5]=item('obsidian');b.items[6]=item('end_crystal');b.items[7]=item('piston');b.items[8]=item('redstone_block');const p=enemy.position.floored();
 b.blockAt=q=>Math.floor(q.y)===63||Math.floor(q.y)===64&&[[1,0],[-1,0],[0,1],[0,-1]].some(([x,z])=>Math.floor(q.x)===p.x+x&&Math.floor(q.z)===p.z+z)?block(q):air(q);
 const plan=r.crystals.plan(enemy);assert(plan,'at least one fully reachable arrangement');assert(b.reach({position:plan.powerPos}));assert(b.reach({position:plan.pistonPos}));assert(rayClear(b,b.entity.position.offset(0,1.62,0),facePoint(plan.base,1),{ignore:[plan.base.position],blocks:[plan.pistonPos]}));
 // The nearer west-side piston is deliberately in the way.
 const bad=p.offset(-2,1,0);assert(!rayClear(b,b.entity.position.offset(0,1.62,0),p.offset(-.5,1,.5),{blocks:[bad]}));assert(!plan.pistonPos.equals(bad));
});
function livePiston(t,{delayPower=false}={}){
 const a=adapter(t),{b,c,item}=a,enemy={id:13n,name:'Enemy',player:true,dimension:0,position:new Vec3(4.5,64,.5)},hole=enemy.position.floored();
 b.entity.position=new Vec3(1,64,-1.5);b.health=20;b.actors.set('13',enemy);b.items[5]=item('obsidian');b.items[6]=item('end_crystal');b.items[7]=item('piston');b.items[8]=item('redstone_block');
 b.blockAt=q=>b.worldMirror.overrides.has(`${Math.floor(q.x)},${Math.floor(q.y)},${Math.floor(q.z)}`)?b.worldMirror.get(q):Math.floor(q.y)===63||Math.floor(q.y)===64&&[[1,0],[-1,0],[0,1],[0,-1]].some(([x,z])=>Math.floor(q.x)===hole.x+x&&Math.floor(q.z)===hole.z+z)?block(q):air(q);
 const runtime={bot:b,config:{pistoncrystal:true,crystalaura:false},manager:{workers:new Map(),store:{data:{enemies:[{name:'Enemy'}]}}}},combat=new CrystalCombat(runtime),trace=[],plan=combat.plan(enemy);assert(plan);
 const Block=require('prismarine-block')(b.registry),queue=c.queue,faces=[[0,-1,0],[0,1,0],[0,0,-1],[0,0,1],[-1,0,0],[1,0,0]];
 const update=(position,name)=>{const entry=b.registry.blocksByName[name];let state=entry.defaultState;if(name==='piston')for(let id=entry.minStateId;id<=entry.maxStateId;id++)if(Number(Block.fromStateId(id).getProperties().facing_direction)===plan.facing){state=id;break;}c.emit('update_block',{position,block_runtime_id:b.worldMirror.wireIds.get(state)??state,layer:0});};
 const push=()=>c.emit('move_entity',{runtime_entity_id:100n,position:hole.offset(.5,1,.5)});
 c.queue=(name,p)=>{queue(name,p);if(name!=='inventory_transaction')return;const tx=p.transaction,d=tx.transaction_data;if(tx.transaction_type==='item_use_on_entity'){trace.push('attack:'+String(d.entity_runtime_id));return;}if(d?.action_type!=='click_block')return;const held=b.name(d.held_item),position=new Vec3(d.block_position.x,d.block_position.y,d.block_position.z);trace.push(held);assert.equal(d.click_pos.y,d.face===1?1:d.face===0?0:.5);queueMicrotask(()=>{
  if(held==='end_crystal')c.emit('add_entity',{runtime_id:100n,unique_id:100n,entity_type:'minecraft:ender_crystal',position:position.offset(.5,1,.5)});
  else{const [x,y,z]=faces[d.face];if(held==='redstone_block'&&delayPower)return;update(position.offset(x,y,z),held);if(held==='redstone_block')push();}
 });};t.after(()=>combat.destroy());return {...a,combat,enemy,trace,plan,confirmPower:()=>{update(plan.powerPos,'redstone_block');push();}};
}
test('PA completes pedestal/piston/crystal/power/break with the real block reach and live facing updates',async t=>{
 const {combat,enemy,trace}=livePiston(t);assert(await combat.tick(enemy));assert.deepEqual(trace,['obsidian','piston','end_crystal','redstone_block','attack:100']);assert.equal(combat.snapshot().pistonStage,'break');assert(combat.snapshot().pistonHistory.some(e=>e.action==='pa_power_confirmed'));
});
test('PA resumes after a late redstone acknowledgement instead of trying to place into the occupied power cell',async t=>{
 const {combat,enemy,trace,confirmPower}=livePiston(t,{delayPower:true});await assert.rejects(combat.tick(enemy),/タイムアウト/);assert.equal(combat.piston.power,false);assert(combat.piston.powerRequestedAt);confirmPower();assert(await combat.tick(enemy));assert(combat.piston.power);assert.equal(trace.filter(n=>n==='redstone_block').length,1);assert(trace.includes('attack:100'));assert(combat.pistonHistory.some(e=>e.action==='pa_power_late_confirmation'));
});
test('a delayed placement acknowledgement cannot release another hand operation',async t=>{
 const {b,c,item}=adapter(t),target=new Vec3(2,64,0);let placed=false;b.blockAt=p=>placed&&new Vec3(p.x,p.y,p.z).floored().equals(target)?block(p):Math.floor(p.y)===63?block(p):air(p);b.items[5]=item('obsidian');
 const pending=b.place(target,b.find('obsidian'));await until(()=>b.quickBarSlot===5&&!b.actionHandBusy);const lease=claim(b);placed=true;b.emit('worldUpdate',target);await pending;assert.equal(b.actionHandBusy,lease);release(b,lease);assert.equal(b.actionHandBusy,false);
});
test('legacy use confirmation from the owning server entity finishes one apple without a second click',async t=>{
 const {b,c,item}=adapter(t);b.serverAuthoritativeInventory=false;b.itemUseDurationMs=50;b.itemUseTimeoutMs=50;b.items[2]=item('enchanted_golden_apple');let clicks=0;const queue=c.queue;
 c.queue=(name,p)=>{queue(name,p);if(name==='inventory_transaction'&&p.transaction.transaction_data?.action_type==='click_air'){clicks++;queueMicrotask(()=>c.emit('entity_event',{runtime_entity_id:b._runtimeEntityId,event_id:'use_item'}));}};
 await b.eat();assert.equal(clicks,1);assert.equal(b.lastItemUse.confirmedBy,'use_item_event');assert.equal(b.lastItemUse.attempts,1);
});
test('an eating animation or a different actor is not consumption proof; an effect suppresses another full use attempt',async t=>{
 const {b,c,item}=adapter(t);b.serverAuthoritativeInventory=false;b.itemUseDurationMs=10;b.itemUseTimeoutMs=15;b.items[2]=item('enchanted_golden_apple');let clicks=0;const queue=c.queue;
 c.queue=(name,p)=>{queue(name,p);if(name==='inventory_transaction'&&p.transaction.transaction_data?.action_type==='click_air'){clicks++;queueMicrotask(()=>{c.emit('entity_event',{runtime_entity_id:42n,event_id:'use_item'});c.emit('entity_event',{runtime_entity_id:b._runtimeEntityId,event_id:'eating_item'});c.emit('mob_effect',{runtime_entity_id:b._runtimeEntityId,event_id:'add',effect_id:10,duration:600,amplifier:4});});}};
 await assert.rejects(b.eat(),/タイムアウト/);assert.equal(clicks,2);assert.equal(b.lastItemUse.status,'unconfirmed');
});
test('confirmed apples are not eaten again for unchanged low health; fresh damage can rearm healing',async t=>{
 const {b,c,r,item}=fixture(t,{heal:true});b.health=16;b.items[2]={...item('enchanted_golden_apple'),count:34};b.itemUseDurationMs=20;b.itemUseTimeoutMs=50;let uses=0;const queue=c.queue;
 c.queue=(name,p)=>{queue(name,p);if(name==='inventory_transaction'&&p.transaction.transaction_data?.action_type==='click_air'){uses++;queueMicrotask(()=>c.emit('inventory_slot',{window_id:'inventory',slot:2,item:{...b.items[2],count:b.items[2].count-1}}));}};
 await r.startUse('体力回復',b.find('enchanted_golden_apple'));for(let n=0;n<5;n++){b.emit('health');await r.tick();}assert.equal(uses,1);assert(!r.needsFood());
 r.healLatch.at=Date.now()-3000;b.health=14;assert(r.needsFood());await r.startUse('体力回復',b.find('enchanted_golden_apple'));assert.equal(uses,2);
});
test('KA can still attack at low health when no food exists and full-block walls still occlude the hit',async t=>{
 const {b,r,item,enemy}=fixture(t,{killaura:true,heal:true});b.health=12;b.items[0]=item('netherite_sword');await r.meleeTick(enemy);assert.equal(r.attacks,1);r.lastAttack=0;b.blockAt=p=>Math.floor(p.x)===2?block(p):air(p);await r.meleeTick(enemy);assert.equal(r.attacks,1);assert.match(r.meleeState,/壁/);
});
test('legacy inventory refresh retries a snapshot without repeating the item transfer',async t=>{
 const {b,c,item}=adapter(t);b.serverAuthoritativeInventory=false;b.items[15]=item('diamond_sword');let swaps=0,syncs=0;const queue=c.queue;let actions;
 c.queue=(name,p)=>{queue(name,p);if(name!=='inventory_transaction')return;if(p.transaction.transaction_type==='normal'){swaps++;actions=p.transaction.actions;}if(p.transaction.transaction_type==='inventory_mismatch'&&++syncs>=2&&actions)for(const a of actions)c.emit('inventory_slot',{window_id:a.window_id,slot:a.slot,item:a.new_item});};
 await b.swap(15,0);assert.equal(swaps,1);assert(syncs>=2);assert.equal(b.name(b.items[0]),'diamond_sword');assert.equal(b.lastStackResponse.status,'ok');
});
test('world lookup cache invalidates live piston updates and does not hold a stale shape or facing',t=>{
 const {b,c}=adapter(t),p=new Vec3(2,64,2),w=b.worldMirror,entry=b.registry.blocksByName.piston,Block=require('prismarine-block')(b.registry);const ids=[];
 for(let id=entry.minStateId;id<=entry.maxStateId;id++)if([2,5].includes(Number(Block.fromStateId(id).getProperties().facing_direction)))ids.push(id);
 assert(ids.length>=2);const wire=id=>w.wireIds.get(id)??id;c.emit('update_block',{position:p,block_runtime_id:wire(ids[0]),layer:0});const before=b.blockAt(p);assert.equal(b.blockAt(p),before);c.emit('update_block',{position:p,block_runtime_id:wire(ids.at(-1)),layer:0});const after=b.blockAt(p);assert.notEqual(after,before);assert.notEqual(after.properties.facing_direction,before.properties.facing_direction);
});
test('ground searches read each block once while comparing alternatives',()=>{
 const calls=new Map(),bot={blockAt:p=>{const key=`${Math.floor(p.x)},${Math.floor(p.y)},${Math.floor(p.z)}`;calls.set(key,(calls.get(key)||0)+1);return Math.floor(p.y)===0||Math.floor(p.x)===3&&Math.abs(Math.floor(p.z))<4?block(p):air(p);}};
 const path=groundPath(bot,new Vec3(0,1,0),new Vec3(6,1,0));assert(path.length);assert([...calls.values()].every(n=>n===1));
});
test('saved v0.3.9 attackall settings migrate to the property used by target selection',t=>{const {r}=fixture(t,{attackAll:false,attackall:true});assert.equal(r.config.attackAll,true);assert.equal(Object.hasOwn(r.config,'attackall'),false);});
test('a delayed timer is measured by elapsed wall time instead of adding 50ms per late callback',async t=>{
 const {b,c,item}=adapter(t);t.mock.timers.enable({apis:['Date'],now:100000});b.serverAuthoritativeInventory=false;b.items[2]=item('enchanted_golden_apple');b.itemUseDurationMs=500;b.itemUseTimeoutMs=20;let first,completion;const queue=c.queue;
 c.queue=(name,p)=>{queue(name,p);if(name==='inventory_transaction'&&p.transaction.transaction_data?.action_type==='click_air'){if(first===undefined)first=performance.now();else{completion=performance.now();queueMicrotask(()=>c.emit('inventory_slot',{window_id:'inventory',slot:2,item:{network_id:0}}));}}};
 const use=b.eat();await until(()=>b.usingItem);t.mock.timers.tick(1000);await use;assert(completion-first<350,'late callback must not restart another half-second wait');assert.equal(b.lastItemUse.attempts,1);
});
