'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Vec3}=require('vec3'),{adapter}=require('./helpers/adapter'),{Runtime}=require('../src/runtime');
const {Store}=require('../src/store'),{Accounts,refreshSaved}=require('../src/accounts');
const {RoofNavigator,ceiling,opening}=require('../src/roof'),{sweptClear}=require('../src/travel');
const UI=require('../web/ui-state');
const air=p=>({name:'air',solid:false,isAir:true,boundingBox:'empty',position:new Vec3(p.x,p.y,p.z).floored(),stateId:0});
const block=(p,name='obsidian')=>({...air(p),name,solid:true,isAir:false,boundingBox:'block',stateId:1});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,ms=1000){const end=Date.now()+ms;while(!fn()){assert(Date.now()<end,'condition timed out');await delay(2);}}
function fixture(t,config={}){
 const a=adapter(t),state={runtime:{gear:false,autototem:false,autoslot:false,heal:false,autolog:false,...config},combatRevision:38,tacticsRevision:38,autoSupply:false,respawn:true,owned:{},minedItems:[]};
 const manager={names:new Map([[1,'Aslrq6th']]),workers:new Map(),store:{data:{enemies:[{name:'Enemy'}],friends:[]},bot:()=>state,save(){}},notice(){}};
 const w={id:1,manager,bot:a.b,state,mode:'stopped',stop(){a.b.halt();},running:false,busy:false},r=w.runtime=new Runtime(w);manager.workers.set(1,w);
 a.b.health=20;a.b.entity.position=new Vec3(.5,64,.5);a.b.blockAt=air;a.b.terrainReady=true;
 const enemy={id:13n,name:'Enemy',player:true,dimension:0,position:new Vec3(3.5,64,.5),seen:Date.now()};a.b.actors.set('13',enemy);
 t.after(()=>r.destroy());return {...a,r,w,manager,enemy};
}
test('real delayed inventory transfer does not stall KA/CA; changing a held slot still blocks melee',async t=>{
 const {b,c,r,item,packets,enemy}=fixture(t,{killaura:true,crystalaura:true,crystalPredict:0});
 b.items[0]=item('diamond_sword');b.items[6]=item('end_crystal');b.items[15]=item('dirt');c.stackDelayMs=220;
 const base=new Vec3(3,63,3);b.blockAt=p=>p.x>=3&&p.x<4&&p.y>=63&&p.y<64&&p.z>=3&&p.z<4?block(base):air(p);
 const transfer=b.swap(15,16);await until(()=>b.pendingStackRequest);
 r.busy=true;r.operation='AutoSlot';await r.combatPulse();
 assert(b.pendingStackRequest,'combat ran before the delayed inventory response');
 assert(r.attacks>=1);assert(packets.some(p=>p.name==='inventory_transaction'&&p.params.transaction.transaction_type==='item_use'));
 await transfer;r.busy=false;assert.equal(b.name(b.items[16]),'dirt');
 // A request that changes the selected sword cannot be raced by another attack.
 r.lastAttack=0;const held=b.swap(0,17);await until(()=>b.pendingStackRequest);const attacks=r.attacks;r.meleeTick(enemy);assert.equal(r.attacks,attacks);await held;
});
test('food starts immediately after hotbar selection while another slot awaits the server',async t=>{
 const {b,c,r,item}=fixture(t,{heal:true});b.items[2]=item('enchanted_golden_apple');b.items[15]=item('dirt');c.stackDelayMs=200;b.itemUseDurationMs=30;b.itemUseTimeoutMs=100;
 const swap=b.swap(15,16);await until(()=>b.pendingStackRequest);let useAt;const queue=c.queue;
 c.queue=(n,p)=>{queue(n,p);if(n==='inventory_transaction'&&p.transaction.transaction_type==='item_use'&&p.transaction.transaction_data.action_type==='click_air'){useAt=Date.now();queueMicrotask(()=>c.emit('inventory_slot',{window_id:'inventory',slot:2,item:{network_id:0}}));}};
 const start=Date.now();r.busy=true;r.startUse('体力回復',b.find('enchanted_golden_apple'));await until(()=>useAt);assert(useAt-start<60);assert(b.pendingStackRequest);await r.consumeTask;assert.equal(b.lastItemUse.status,'confirmed');assert(b.lastItemUse.selectDelayMs<60);await swap;
});
test('eating retreat keeps the real Anti embed and uses 0.12 horizontal movement',t=>{
 const {b,r}=fixture(t,{killaura:true,heal:true,anticrystal:true});b.entity.onGround=true;b.blockAt=p=>Math.floor(p.y)===63?block(p):air(p);
 assert(r.travel.bury(.55));r.travel.step();b.handUse={kind:'food',phase:'using',slot:2};r.consumeTask=Promise.resolve();r.motionTick();
 assert(r.travel.embed);assert.equal(r.travel.following.kind,'retreat');const before=b.entity.position.clone();assert(r.travel.step());assert(r.travel.embed);assert.equal(r.config.anticrystal,true);assert(Math.abs(Math.hypot(b.entity.position.x-before.x,b.entity.position.z-before.z)-.12)<1e-6);assert.equal(b.entity.position.y,63.45);
 b.handUse=null;r.consumeTask=null;
});
test('NoSlow applies the configured food speed in the real physics loop',t=>{
 t.mock.timers.enable({apis:['setInterval']});const {b,r,packets}=fixture(t,{eatSpeed:.12,noSlow:true});b.blockAt=p=>Math.floor(p.y)===63?block(p):air(p);b.entity.onGround=true;b.handUse={kind:'food',phase:'using',slot:2};b.setControlState('forward',true);b.desiredMoveWorld={x:1,z:0};b.physicsEnabled=true;b.emit('spawn');
 t.mock.timers.tick(50);const input=packets.find(p=>p.name==='player_auth_input');assert(input);assert(Math.abs(input.params.delta.x-.12)<1e-6);assert.equal(r.config.eatSpeed,.12);b.handUse=null;
});
test('an active user flight retains glide during planning and at its destination; explicit stop releases it',async t=>{
 const {b,r,item,packets}=fixture(t);b.items[1]=item('elytra');b.armor[1]=item('elytra');b.terrainEstablished=true;b.entity.position=new Vec3(.5,80,.5);b.gliding=true;
 r.travel.command('fly','overworld',20.5,80,.5);await r.travel.tick();assert(r.travel.flight.holdGlide);r.travel.flight.paused='replan';r.travel.flight.retryAt=Date.now()+500;
 assert(r.travel.step());assert(b.gliding);assert.deepEqual(b.entity.velocity,new Vec3(0,0,0));
 b.entity.position=new Vec3(20.5,80,.5);await r.travel.tick();assert.equal(r.travel.route,null);assert(b.gliding);assert(r.travel.flight.holdGlide);r.stop();assert(!b.gliding);assert(packets.some(p=>p.name==='player_action'&&p.params.action==='stop_glide'));
});
function roofWorld(p){const x=Math.floor(p.x),y=Math.floor(p.y),z=Math.floor(p.z),hole=x>=18&&x<=22&&z>=-2&&z<=2;return y===10&&!hole?block(p):air(p);}
test('00 roof flight crosses the received opening before traveling above the obsidian floor',t=>{
 const {b,r}=fixture(t);b.entity.position=new Vec3(.5,5,.5);b.blockAt=roofWorld;const goal=new Vec3(60.5,15,.5),roof=ceiling(b,b.entity.position);assert.deepEqual(roof,{bottom:10,top:10});
 const navigator=new RoofNavigator(b,goal,roof,sweptClear,1.3);r.travel.flight={goal,holdGlide:true,roof:navigator};
 let crossed=false;for(let i=0;i<200&&b.entity.position.distanceTo(goal)>.2;i++){
  const before=b.entity.position.clone();r.travel.step();assert(sweptClear(b,before,b.entity.position,1.3));
  if(before.y<11&&b.entity.position.y>=11){crossed=true;assert(b.entity.position.x>=19&&b.entity.position.x<=22);}
 }assert(crossed);assert(b.entity.position.distanceTo(goal)<.3);assert.equal(navigator.phase,'done');
});
test('unknown roof cells are not openings; a navigator explores another loaded region before finding a distant hole',t=>{
 t.mock.timers.enable({apis:['Date'],now:100000});const bot={blockAt:p=>{const x=Math.floor(p.x),y=Math.floor(p.y),z=Math.floor(p.z);if(y===10&&x>=60&&x<=64&&Math.abs(z)<=2)return air(p);if(y===10)return block(p);return air(p);}},start=new Vec3(.5,5,.5),roof={bottom:10,top:10};
 const unknown={blockAt:p=>Math.floor(p.y)===10?null:air(p)};assert.equal(opening(unknown,start,roof,sweptClear,1.3),null);
 const n=new RoofNavigator(bot,new Vec3(100.5,15,.5),roof,sweptClear,1.3);let p=start,found=false;
 for(let i=0;i<80;i++){const next=n.next(p);assert(sweptClear(bot,p,next,1.3));p=next.clone();t.mock.timers.tick(900);if(p.y>10){found=true;break;}}
 assert(found);assert(n.searches>1);assert(n.visited.size>1);
});
function loginFixture(t,profile='Account One'){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'asira-login-')),store=new Store(dir),flows=[];
 class Flow{constructor(username,directory,options,code){Object.assign(this,{username,directory,options,code,msa:{}});flows.push(this);}getMinecraftBedrockToken(){this.code({user_code:'PRIVATE-DEVICE',expires_in:600});return new Promise((resolve,reject)=>{this.resolve=()=>{fs.writeFileSync(path.join(this.directory,'user_live-cache.json'),JSON.stringify({token:{refresh_token:'PRIVATE-REFRESH'}}));const payload=Buffer.from(JSON.stringify({extraData:{displayName:profile}})).toString('base64url');resolve({chain:['first',`header.${payload}.signature`]});};this.reject=reject;});}}
 const accounts=new Accounts(store,{Flow,run:(_scope,fn)=>fn()});t.after(()=>{accounts.destroy();fs.rmSync(dir,{recursive:true,force:true});});return {accounts,store,flows,dir};
}
test('standalone Microsoft login saves the verified account and survives restart without any game connection',async t=>{
 const {accounts,store,flows,dir}=loginFixture(t);const start=accounts.start(1,'Account One');assert.equal(start.state,'waiting');assert(start.code);assert.equal(accounts.start(1,'Account One').code.value,start.code.value);assert.equal(flows.length,1);
 flows[0].resolve();await accounts.jobs.get(1).promise;const saved=accounts.snapshot(1,'Account One');assert.equal(saved.state,'ready');assert(saved.saved);assert.equal(saved.profile,'Account One');assert(!JSON.stringify(saved).includes('PRIVATE-REFRESH'));
 const reloaded=new Accounts(new Store(dir));t.after(()=>reloaded.destroy());assert(reloaded.snapshot(1,'Account One').saved);assert.equal(reloaded.snapshot(1,'Account One').profile,'Account One');assert(!reloaded.snapshot(1,'Another Account').saved);
 assert.equal(fs.statSync(path.join(accounts.directory(1,'Account One'),'user_live-cache.json')).mode&0o777,0o600);assert(store.data.bots[1].authAccounts);
});
test('wrong-account login fails; switching/cancelling ignores a late result and never marks it authenticated',async t=>{
 const {accounts,flows}=loginFixture(t,'Wrong Name');accounts.start(1,'Account One');flows[0].resolve();await accounts.jobs.get(1).promise;assert.equal(accounts.snapshot(1,'Account One').state,'failed');assert.equal(accounts.snapshot(1,'Account One').profile,null);assert(!accounts.snapshot(1,'Account One').saved);
 accounts.start(2,'Account Two');const late=accounts.jobs.get(2).promise;accounts.cancel(2);flows[1].resolve();await late;assert.equal(accounts.snapshot(2,'Account Two').profile,null);assert.equal(accounts.jobs.has(2),false);
});
test('empty and corrupt auth cache files never appear as saved credentials',t=>{
 const {accounts}=loginFixture(t),dir=accounts.directory(1,'Account One');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'x_live-cache.json'),'{}');assert(!refreshSaved(dir));fs.writeFileSync(path.join(dir,'x_live-cache.json'),'{bad');assert(!accounts.snapshot(1,'Account One').saved);
});
test('drag-drop rejects another account or changed stack; pending notifications cover unselected bots',()=>{
 const bot={id:1,connected:true,inventory:[{name:'obsidian',count:64,token:'a'}]},drag=UI.drag(bot,0);assert(UI.validateDrag(drag,bot));assert(!UI.validateDrag(drag,{...bot,id:2}));bot.inventory[0].token='b';assert(!UI.validateDrag(drag,bot));assert.equal(UI.drag({...bot,connected:false},0),null);
 const seen=new Set(),bots=[{id:1,restock:null},{id:11,name:'IGN',restock:{id:'ign-request',status:'pending'}}];assert.equal(UI.pendingAlerts(bots,seen)[0].bot.id,11);assert.equal(UI.pendingAlerts(bots,seen).length,0);
});

test('Jetpack sends the break as soon as its crystal is received, and waits for actual knockback before boosting',async t=>{
 const {b,c,r,item,packets,enemy}=fixture(t,{jetpack:true});enemy.position=new Vec3(25,64,.5);b.items[6]=item('end_crystal');b.offhand[0]=item('totem_of_undying');b.blockAt=p=>Math.floor(p.y)===63?block(p):air(p);
 const start=Date.now();assert(await r.crystals.jetpackTick(enemy));assert(Date.now()-start<100);assert(r.crystals.boost);assert.equal(r.travel.flight,null);
 const p=r.crystals.boost.position;c.emit('add_entity',{runtime_id:900n,unique_id:900n,entity_type:'minecraft:ender_crystal',position:p});await r.crystals.jetpackTick(enemy);
 assert(packets.some(p=>p.name==='inventory_transaction'&&p.params.transaction.transaction_type==='item_use_on_entity'&&p.params.transaction.transaction_data.entity_runtime_id===900n));assert.equal(r.travel.flight,null);
 c.emit('remove_entity',{entity_id_self:900n});await r.crystals.jetpackTick(enemy);assert.equal(r.travel.flight,null);c.emit('set_entity_motion',{runtime_entity_id:b._runtimeEntityId,velocity:{x:1,y:.4,z:0}});await r.crystals.jetpackTick(enemy);assert(r.travel.flight.jetpack);assert(r.travel.flight.expires<=Date.now()+1000);
});
