'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {Vec3}=require('vec3');
const {adapter}=require('./helpers/adapter');
const {Runtime}=require('../src/runtime');
const tactics=require('../src/tactics');
const air=p=>({name:'air',position:new Vec3(p.x,p.y,p.z).floored(),solid:false,isAir:true,stateId:0});
function fixture(t,config={}){
 const a=adapter(t),state={runtime:{gear:false,autototem:false,autoslot:false,heal:false,autolog:false,...config},combatRevision:37,tacticsRevision:37,autoSupply:false,respawn:true,owned:{},minedItems:[],floor:null};
 const manager={names:new Map([[1,'Aslrq6th']]),workers:new Map(),notices:[],store:{data:{enemies:[],friends:[],admins:[]},bot:()=>state,save(){}},notice(id,text){this.notices.push(text);}};
 const worker={id:1,bot:a.b,state,manager,running:false,busy:false,stop(){this.running=false;a.b.halt();},mode:'stopped'};
 const runtime=worker.runtime=new Runtime(worker);manager.workers.set(1,worker);a.b.health=20;a.b.terrainReady=true;a.b.blockAt=air;
 t.after(()=>runtime.destroy());return {...a,r:runtime,w:worker,manager,state};
}
function actor(name,id,x,dimension=0){return {name,id:BigInt(id),player:true,dimension,position:new Vec3(x,64,.5),seen:Date.now()};}
test('indiscriminate mode is opt-in, limited to 30m, and excludes friends/admins/fleet even if listed as enemies',t=>{
 const {b,r,manager}=fixture(t);b.entity.position=new Vec3(.5,64,.5);const stranger=actor('Stranger',11,20),far=actor('Far',12,31),ally=actor('Friend One',13,5),owner=actor('Asira',14,6),bot=actor('Other Bot',15,3);
 for(const a of [stranger,far,ally,owner,bot])b.actors.set(String(a.id),a);
 manager.store.data.friends=[{name:ally.name}];manager.store.data.admins=[{name:owner.name}];manager.names.set(2,bot.name);
 assert.equal(tactics.eligible(r,stranger),false);r.config.attackAll=true;assert(tactics.eligible(r,stranger));assert(!tactics.eligible(r,far));for(const a of [ally,owner,bot]){manager.store.data.enemies.push({name:a.name});assert(!tactics.eligible(r,a));}
 assert.equal(r.chooseTarget().name,'Stranger');r.paused=true;r.motionTick();assert.equal(r.attacks,0);
});
test('fleet assistance requires a recent same-world fight and a helper within 30m',t=>{
 const {b,r,manager}=fixture(t);b.entity.position=new Vec3(.5,64,.5);const enemy=actor('Not listed',11,22);b.actors.set('11',enemy);const ally={connected:true,config:{...b.config},dimensionId:0,entity:{position:new Vec3(10,64,.5)}};
 manager.workers.set(2,{bot:ally,runtime:{paused:false,target:enemy,engagedAt:Date.now()}});assert(tactics.eligible(r,enemy));ally.config.host='another';assert(!tactics.eligible(r,enemy));ally.config.host=b.config.host;ally.entity.position.x=40;assert(!tactics.eligible(r,enemy));
});
test('CA blast ranking favors an exposed enemy over a closer shielded point and protects registered friends',t=>{
 const {b,r,manager}=fixture(t);const enemy=actor('Enemy',10,4.5);b.entity.position=new Vec3(.5,64,.5);
 const exposed=new Vec3(4,64,2.5),blocked=new Vec3(3,64,.5);b.blockAt=p=>Math.floor(p.x)===3&&Math.floor(p.z)===0?{...air(p),name:'obsidian',solid:true}:air(p);
 const open=tactics.explosionDamage(b,exposed,enemy.position),hidden=tactics.explosionDamage(b,blocked,enemy.position);assert(open>hidden,{open,hidden});
 manager.store.data.friends=[{name:'Friend'}];b.actors.set('20',actor('Friend',20,4));assert.equal(tactics.blastScore(r,exposed,enemy),null);
});
test('BPS measures horizontal position changes and resets on teleports rather than reporting a huge speed',()=>{
 const bot={entity:{position:new Vec3(0,64,0)}},t=new tactics.Telemetry(bot);t.sample(1000);bot.entity.position.x=4;t.sample(2000);assert.equal(t.value.bps,4);bot.entity.position=new Vec3(100,64,0);t.sample(2100);assert.equal(t.value.bps,0);
});
test('nearby players include observed armor/hands and live fleet positions with distance',t=>{
 const {b,c,item,r,manager}=fixture(t);b.entity.position=new Vec3(.5,64,.5);c.emit('add_player',{runtime_id:50n,username:'Equipped',position:{x:5.5,y:65.62,z:.5},held_item:item('diamond_sword')});
 c.emit('mob_armor_equipment',{runtime_entity_id:50n,helmet:item('diamond_helmet'),chestplate:item('diamond_chestplate'),leggings:{network_id:0},boots:{network_id:0}});c.emit('mob_equipment',{runtime_entity_id:50n,window_id:'offhand',item:item('totem_of_undying')});
 const other={connected:true,username:'Fleet',config:{...b.config},dimensionId:0,entity:{position:new Vec3(10.5,64,.5)},armor:[],offhand:[],items:[],name:i=>i?.name||''};manager.workers.set(2,{bot:other});const rows=tactics.nearby(r);assert.equal(rows[0].distance,5);assert.equal(rows[0].mainhand.name,'diamond_sword');assert.equal(rows[0].offhand.name,'totem_of_undying');assert.equal(rows[0].armor[0].name,'diamond_helmet');assert.equal(rows[1].distance,10);assert(rows[1].bot&&rows[1].friend);
});
test('AutoLog ignores low health while a Totem is equipped or carried, and logs only after the last one is gone',async t=>{
 const {b,r,item}=fixture(t,{autolog:true,logOnlyEmptyTotem:true});b.health=6;b.items[10]=item('totem_of_undying');await r.tick();assert(!b.ended);b.items[10]=null;b.offhand[0]=item('totem_of_undying');await r.tick();assert(!b.ended);b.offhand[0]=null;await r.tick();assert(b.ended);
});
test('rollback temporarily bypasses Anti and Speed without changing settings, and a later user OFF stays OFF',t=>{
 const {b,r}=fixture(t,{anticrystal:true,chaseSpeed:.27});t.mock.timers.enable({apis:['Date'],now:100000});b.entity.position=new Vec3(.5,65,.5);b.entity.onGround=true;b.blockAt=p=>Math.floor(p.y)===64?{...air(p),name:'stone',solid:true,boundingBox:'block'}:air(p);assert(r.travel.bury(.55));r.travel.step();b.emit('forcedMove');assert.equal(r.config.anticrystal,true);assert.equal(r.config.chaseSpeed,.27);assert.equal(r.travel.embed,null);assert(r.speedBlockedUntil>Date.now());t.mock.timers.tick(250);r.travel.recoverAnti();assert.equal(b.entity.position.y,65);r.config.anticrystal=false;t.mock.timers.tick(6000);r.travel.step();assert.equal(r.travel.embed,null);
});
test('gapple use starts without waiting for a busy combat operation and retreats along a real supported route',async t=>{
 const {b,c,item,r,manager}=fixture(t,{heal:true,killaura:true});b.items[2]=item('enchanted_golden_apple');b.health=10;b.entity.position=new Vec3(.5,64,.5);b.blockAt=p=>Math.floor(p.y)<64?{...air(p),name:'stone',solid:true,boundingBox:'block'}:air(p);const enemy=actor('Enemy',10,3);manager.store.data.enemies=[{name:'Enemy'}];b.actors.set('10',enemy);r.busy=true;b.itemUseDurationMs=10;
 const q=c.queue;let use=0;c.queue=(n,p)=>{q(n,p);if(n==='inventory_transaction'&&p.transaction.transaction_type==='item_use'&&p.transaction.transaction_data.action_type==='click_air'){use++;queueMicrotask(()=>c.emit('inventory_slot',{window_id:'inventory',slot:2,item:{network_id:0}}));}};
 await r.tick();r.motionTick();await r.consumeTask;assert(use>0);assert.equal(b.lastItemUse.status,'confirmed');assert.equal(r.travel.following?.kind,'retreat');assert(r.retreatGoal.x<.5);r.busy=false;
});
test('large-wall flight planner chooses a loaded side corridor beyond the old local search horizon',()=>{
 const {airDetour}=require('../src/navigation'),{sweptClear}=require('../src/travel');const b={blockAt:p=>Math.floor(p.x)===4&&p.z>-35&&p.z<35&&p.y<100?{name:'obsidian',solid:true}:air(p)};const start=new Vec3(.5,8,.5),goal=new Vec3(20.5,8,.5),path=airDetour(b,start,goal,sweptClear,1.3);assert(path?.length);assert(Math.abs(path[0].position.z) >=35);assert(sweptClear(b,start,path[0].position,1.3));assert(sweptClear(b,path[0].position,path[1].position,1.3));
});
test('restock does not touch containers before approval, rejects stale approvals, and preserves interrupted one-kit state',async t=>{
 const {r,w,state}=fixture(t);let taken=0;r.restock.kit=async job=>{if(!job.kitTaken){job.kitTaken=true;taken++;}throw Error('connection interrupted');};
 const job=r.restock.request('Crystal不足');assert.equal(job.status,'pending');await r.restock.tick();assert.equal(taken,0);assert.throws(()=>r.restock.decide('stale',true));r.restock.decide(job.id,true);await r.restock.tick();assert.equal(taken,1);assert.equal(state.restock.status,'failed');r.restock.decide(job.id,true);await r.restock.tick();assert.equal(taken,1);
});
test('death restock creates a notification only; a different dimension cannot execute the old approval',async t=>{
 const {b,r,w,state}=fixture(t);state.autoSupply=true;const job=r.restock.request('死亡後の1kit','kit',true);r.restock.decide(job.id,true);b.dimensionId=1;let called=false;r.restock.kit=async()=>{called=true;return true;};await r.restock.tick();assert.equal(called,false);assert.equal(state.restock.status,'failed');assert.match(state.restock.error,/世界/);
});
test('FeetTrap fills only empty supported sides and stops when the target moves',async t=>{
 const {b,r,item}=fixture(t,{feettrap:true});b.entity.position=new Vec3(.5,64,.5);b.items[7]={...item('obsidian'),count:64};const enemy=actor('Enemy',10,4.5),placed=[];b.blockAt=p=>Math.floor(p.y)<64?{...air(p),name:'stone',solid:true,boundingBox:'block'}:air(p);b.reach=()=>true;b.place=async p=>{placed.push(p);enemy.position.x=10;};await r.crystals.feetTrap(enemy);assert.equal(placed.length,1);assert.equal(placed[0].y,64);
});
test('Jetpack retries breaking its own received crystal without placing another one',async t=>{
 const {b,r,packets}=fixture(t);const crystal={id:99n,name:'minecraft:ender_crystal',position:new Vec3(2,64,.5)};b.actors.set('99',crystal);r.crystals.boost={at:Date.now(),position:crystal.position,crystalId:'99',lastAttack:Date.now()-200};await r.crystals.jetpackTick(actor('Enemy',10,20));assert(packets.some(p=>p.name==='inventory_transaction'&&p.params.transaction.transaction_type==='item_use_on_entity'));assert.equal(r.crystals.boost.crystalId,'99');assert.equal(r.travel.flight,null);
});
test('one approved kit retrieves only one shulker, takes needed items, and returns the partly full box',async t=>{
 const {b,r,w,item,state}=fixture(t);state.autoSupply=true;const chestPos=new Vec3(2,64,0),boxPos=new Vec3(4,64,0),map=new Map();const k=p=>`${Math.floor(p.x)},${Math.floor(p.y)},${Math.floor(p.z)}`;
 const kit=item('white_shulker_box',10),second=item('blue_shulker_box',11),helmet=item('diamond_helmet',20);b.armor[0]=helmet;const chest=[kit,second,...Array(25).fill(null)],box=[{...item('end_crystal',30),count:64},{...item('enchanted_golden_apple',31),count:12},helmet,...Array(24).fill(null)];map.set(k(chestPos),'ender_chest');
 b.blockAt=p=>map.has(k(p))?{name:map.get(k(p)),position:p.floored(),solid:true,boundingBox:'block',stateId:1}:Math.floor(p.y)<64?{...air(p),name:'stone',solid:true,boundingBox:'block'}:air(p);b.reach=()=>true;w.supplySpot=()=>boxPos;w.placeOwned=async(p,i)=>{map.set(k(p),i.name);b.items[i.slot]=null;};w.collectPlaced=async(p,name)=>{map.delete(k(p));const free=b.items.findIndex(i=>!i);b.items[free]=item(name,500);return b.list().find(i=>i.slot===free);};
 b.openContainer=async p=>{b.window={id:k(p)===k(chestPos)?15:16,type:'container',items:k(p)===k(chestPos)?chest:box,ready:true};return b.window;};b.closeContainer=()=>{b.window=null;};
 const transfers=[],original=b.transfer.bind(b);b.transfer=async(...args)=>{transfers.push({window:b.window?.id,args});return original(...args);};const job=r.restock.request('Crystal不足');r.restock.decide(job.id,true);await r.restock.tick();assert.equal(job.status,'done',job.error);assert.equal(b.count('end_crystal'),64);assert.equal(b.count('enchanted_golden_apple'),12);assert.equal(chest[1],second);assert(chest.some(v=>b.name(v)==='white_shulker_box'));assert.equal(box[2],helmet);assert.equal(transfers.filter(v=>v.window===15&&v.args[0]&&v.args[1]===0).length,1);await r.restock.tick();assert.equal(transfers.filter(v=>v.window===15&&v.args[0]&&v.args[1]===0).length,1);
});
test('obsidian conversion consumes one owned chest only after approval and uses a non-Silk Touch diamond tool',async t=>{
 const {b,r,w,item}=fixture(t);b.items[1]=item('diamond_pickaxe',1);b.items[8]=item('ender_chest',8);const p=new Vec3(2,64,0);let placed=false,dug=false;w.supplySpot=()=>p;w.placeOwned=async(q,i)=>{assert.equal(i.name,'ender_chest');placed=true;b.items[8]=null;};w.removeOwned=()=>{};
 b.blockAt=q=>q.equals?.(p)&&!dug&&placed?{name:'ender_chest',solid:true,boundingBox:'block',position:p}:{...air(q),name:Math.floor(q.y)<64?'stone':'air',solid:Math.floor(q.y)<64,boundingBox:Math.floor(q.y)<64?'block':'empty'};
 b.dig=async(block,signal,tool)=>{assert.equal(block.name,'ender_chest');assert.equal(tool.name,'diamond_pickaxe');assert.equal(b.enchant(tool.raw,'silk_touch',16),false);dug=true;b.items[7]={...item('obsidian',70),count:8};};b.go=async()=>{};const job=r.restock.request('黒曜石0','obsidian');await r.restock.tick();assert.equal(placed,false);r.restock.decide(job.id,true);await r.restock.tick();assert.equal(job.status,'done',job.error);assert(placed&&dug);assert.equal(b.count('ender_chest'),0);assert.equal(b.count('obsidian'),8);
});
