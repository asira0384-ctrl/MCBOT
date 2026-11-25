'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3');
const {fixture,peer}=require('../helpers/mining-world'),{ConnectionKeeper}=require('../../src/app/connection-keeper');
const {createSerializer,createDeserializer}=require('bedrock-protocol/src/transforms/serializer');

for(const version of ['1.26.51','1.26.60'])for(const inventory of [false,true])test(`${version} Nether obsidian mining respects inventory authority=${inventory}`,async t=>{
 const f=fixture(t,{version}),{b,c}=f;b.dimensionId=1;b.entity.position=new Vec3(21.5,74,-48.5);b.items[1]=f.item('netherite_pickaxe',1,217);
 const breaks=peer(f,{modern:true,inventory}),p=new Vec3(24,73,-49);f.set(p,'obsidian');let tick=0;
 const timer=setInterval(()=>c.queue('player_auth_input',{pitch:0,yaw:0,head_yaw:0,position:{x:21.5,y:75.62,z:-48.5},delta:{x:0,y:0,z:0},move_vector:{x:0,y:0},input_data:0n,tick:BigInt(++tick)}),50);t.after(()=>clearInterval(timer));
 await b.dig(b.blockAt(p),undefined,undefined,{timeout:1500});assert.equal(b.digState.face,4);assert.equal(b.digState.confirmed,true);assert.equal(breaks.length,1);assert(b.connected);
 const decoded=createDeserializer(version).parsePacketBuffer(createSerializer(version).createPacketBuffer(breaks[0])).data.params;
 assert.deepEqual(decoded.block_action.find(a=>a.action==='predict_break').position,{x:24,y:73,z:-49});
 assert.equal(decoded.input_data.includes('item_stack_request'),inventory);
 if(inventory){assert.equal(decoded.item_stack_request.actions[0].network_id,1);assert.equal(decoded.item_stack_request.actions[0].predicted_durability,218);}else assert.equal(decoded.item_stack_request,undefined);
 assert(!f.packets.some(p=>p.name==='inventory_transaction'&&p.params.transaction?.transaction_data?.action_type==='break_block'));
});

test('an unconfirmed stack identity waits without sending a malformed completion',async t=>{
 const f=fixture(t);peer(f,{modern:true});f.b.items[1]=f.item('netherite_pickaxe',0);const p=new Vec3(1,65,0);f.set(p,'stone');
 await assert.rejects(f.b.dig(f.b.blockAt(p)),/サーバー確認/);assert.equal(f.b.actionHandBusy,false);assert(!f.b.mining);assert(!f.packets.some(p=>p.params.item_stack_request));assert(!f.packets.some(p=>p.params.block_action?.some(a=>a.action==='predict_break')));
});

test('mining uses the current server stack identity and durability after a slot correction',async t=>{
 const f=fixture(t),{b,c}=f;peer(f,{modern:true});b.breakTime=()=>200;const p=new Vec3(1,65,0);f.set(p,'stone');let tick=0,corrected=false;
 const timer=setInterval(()=>{c.queue('player_auth_input',{pitch:0,yaw:0,head_yaw:0,position:{x:.5,y:66.62,z:.5},delta:{x:0,y:0,z:0},move_vector:{x:0,y:0},input_data:0n,tick:BigInt(++tick)});if(!corrected&&b.digState?.phase==='breaking'){corrected=true;c.emit('inventory_slot',{window_id:'inventory',slot:1,item:f.item('netherite_pickaxe',73,217)});}},50);t.after(()=>clearInterval(timer));
 await b.dig(b.blockAt(p),undefined,undefined,{timeout:1500});const a=f.packets.find(p=>p.params.item_stack_request).params.item_stack_request.actions[0];assert(corrected);assert.equal(a.network_id,73);assert.equal(a.predicted_durability,218);assert(b.digState.confirmed);
});

test('a kick always finishes the session even if the transport omits its close event',async t=>{
 const f=fixture(t);f.c.disconnect=()=>{};f.c.close=()=>{};const errors=[];let ended=0;f.b.removeAllListeners('error');f.b.on('error',e=>errors.push(e));f.b.on('end',()=>ended++);
 f.c.emit('kick',{message:'Corrupted packet'});await new Promise(resolve=>setImmediate(resolve));assert.equal(f.b.connected,false);assert.equal(f.b.ended,true);assert.equal(ended,1);assert.equal(errors[0].message,'Corrupted packet');f.c.emit('close');assert.equal(ended,1);
});

test('reconnect continues beyond six failures with capped delay, and explicit disconnect cancels it',async()=>{
 const scheduled=[],cancelled=[],s={connectionWanted:true},m={store:{bot:()=>s,save(){}},names:new Map([[1,'Bot']]),workers:new Map(),accounts:{snapshot:()=>({saved:true,state:'ready'})},connectRequests:new Map(),connectionResults:new Map(),requestConnection(id){this.connectionResults.set(id,{state:'failed'});}};
 const k=new ConnectionKeeper(m,{schedule:(fn,ms)=>{const t={fn,ms};scheduled.push(t);return t;},cancel:t=>cancelled.push(t)});k.attempts.set(1,6);await k.connect(1);assert.equal(k.attempts.get(1),7);assert.equal(k.snapshot(1).phase,'waiting');assert(scheduled[0].ms>=60000&&scheduled[0].ms<62000);
 k.wanted(1,false,'manual');assert(cancelled.includes(scheduled[0]));await k.connect(1);assert.equal(k.attempts.has(1),false);assert.equal(k.snapshot(1).wanted,false);assert.equal(scheduled.length,1);k.stop();
});

test('automatic reconnect never loops a failed Microsoft authentication',async()=>{
 let requested=0;const s={connectionWanted:true},m={store:{bot:()=>s},names:new Map([[1,'Bot']]),workers:new Map(),accounts:{snapshot:()=>({saved:true,state:'failed',error:'Sign in again'})},requestConnection(){requested++;},notice(){}};
 const k=new ConnectionKeeper(m);await k.connect(1);assert.equal(requested,0);assert.equal(k.snapshot(1).phase,'authentication');assert.equal(k.timers.size,0);k.stop();
});

test('version aliases select the latest installed release or server discovery without overriding a pinned version',()=>{
 const {connectionVersion}=require('../../src/bedrock/server-version'),{CURRENT_VERSION}=require('bedrock-protocol/src/options');
 assert.equal(CURRENT_VERSION,'1.26.60');assert.equal(connectionVersion(1,{MC_VERSION:'latest'}),'1.26.60');assert.equal(connectionVersion(11,{IGN_VERSION:'latest'}),'1.26.60');assert.equal(connectionVersion(1,{}),undefined);assert.equal(connectionVersion(11,{IGN_VERSION:'auto'}),undefined);assert.equal(connectionVersion(1,{MC_VERSION:'1.26.51'}),'1.26.51');assert.throws(()=>connectionVersion(1,{MC_VERSION:'broken'}));
});

for(const [version,count,protocol]of [['1.26.51',22091,2193],['1.26.60',23960,2225]])test(`${version} has a complete, non-air-substituting network block palette`,()=>{
 const registry=require('prismarine-registry')('bedrock_'+version),{install}=require('../../src/bedrock/network-palette');for(const hashed of [false,true]){const palette=install(registry,version,hashed);assert.equal(palette.info.protocol,protocol);assert.equal(palette.info.entries,count);assert.equal(palette.ordered.size,count);for(const name of ['air','obsidian','netherrack','bedrock']){const state=registry.blocksByName[name].defaultState,id=palette.reverse.get(state);assert.equal((hashed?palette.hashes:palette.ordered).get(id).name,name);}}
});
