'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {Vec3}=require('vec3'),{createSerializer}=require('bedrock-protocol/src/transforms/serializer');
const {adaptInput,blockActionNames}=require('../src/protocol'),digging=require('../src/digging');
const {fixture,peer}=require('./helpers/mining-world');
const raw=tick=>({pitch:0,yaw:0,head_yaw:0,position:{x:.5,y:66.62,z:.5},delta:{x:0,y:0,z:0},move_vector:{x:0,y:0},input_data:0n,tick:BigInt(tick)});
function pump(f,t){let tick=0;const frame=()=>f.c.queue('player_auth_input',raw(++tick)),timer=setInterval(frame,20);t.after(()=>clearInterval(timer));return frame;}
function inputActions(packets){return packets.filter(p=>p.name==='player_auth_input').flatMap(p=>p.params.block_action||[]);}
function reader(buffer){let offset=0;return {uint(){let value=0n,shift=0n,byte;do{assert(offset<buffer.length);byte=buffer[offset++];value|=BigInt(byte&127)<<shift;shift+=7n;}while(byte&128);return value;},int(){const n=this.uint();return Number((n>>1n)^-(n&1n));},skip(n){offset+=n;},get offset(){return offset;}};}

test('non-mining actions never enter PlayerAuthInput block actions; stop uses default fields',()=>{
 const b={registry:require('prismarine-registry')('bedrock_1.26.51'),controlState:{},pendingBreakActions:[{action:'get_updated_block',position:{x:1,y:65,z:0},face:1},{action:'respawn',position:{x:1,y:65,z:0},face:1},{action:'stop_break',position:{x:1,y:65,z:0},face:1}]};
 const p=adaptInput(b,raw(1));assert.deepEqual(p.block_action,[{action:'stop_break',position:{x:0,y:0,z:0},face:0}]);assert.equal(b.rejectedBlockActions,2);assert(p.input_data.includes('block_action'));
 const empty=adaptInput(b,{...raw(2),block_action:[{action:'get_updated_block'}]});assert(!empty.block_action);assert(!empty.input_data.includes('block_action'));
});

test('modern teleport and terrain acknowledgments use input flags with independent byte checks',t=>{
 const f=fixture(t);f.b.emit('terrainDecoded');f.c.emit('move_player',{runtime_id:f.b._runtimeEntityId,mode:'teleport',position:{x:.5,y:66.62,z:.5},on_ground:true,pitch:0,yaw:0,head_yaw:0});f.c.queue('player_auth_input',raw(1));
 assert(!f.packets.some(p=>p.name==='player_action'&&['handled_teleport','received_server_data'].includes(p.params.action)));
 const p=f.packets.findLast(p=>p.name==='player_auth_input'),buffer=createSerializer('1.26.51').createPacketBuffer(p),r=reader(buffer);assert.equal(r.uint(),144n);r.skip(32);const count=Number(r.uint()),flags=Array.from({length:count},()=>r.int());assert(flags.includes(37));assert(flags.includes(44));assert.equal(new Set(flags).size,flags.length);
});

test('legacy teleport acknowledgment retains unsigned 64-bit ID and zero block fields',()=>{
 const sent=[],id=9223372036854775807n,b={registry:require('prismarine-registry')('bedrock_1.26.51'),advertisedMovement:'client',entity:{position:new Vec3(-12,65,8)},_runtimeEntityId:id,client:{queue:(name,params)=>sent.push({name,params})}};
 assert(require('../src/session').action(b,'handled_teleport'));assert.equal(sent.length,1);const buffer=createSerializer('1.26.51').createPacketBuffer(sent[0]),r=reader(buffer);assert.equal(r.uint(),36n);assert.equal(r.uint(),id);assert.equal(r.int(),30);for(let i=0;i<7;i++)assert.equal(r.int(),0);assert.equal(r.offset,buffer.length);
});

test('mining durability request has variant 9 and matching legacy action byte 11',()=>{
 const params=require('../src/protocol').request(-1,[{type_id:'mine_block',hotbar_slot:1,predicted_durability:2,network_id:123}]);const buffer=createSerializer('1.26.51').createPacketBuffer({name:'item_stack_request',params}),r=reader(buffer);assert.equal(r.uint(),147n);assert.equal(r.uint(),1n);assert.equal(r.int(),-1);assert.equal(r.uint(),1n);assert.equal(r.uint(),9n);assert.equal(r.uint(),11n);assert.equal(r.int(),1);assert.equal(r.int(),2);assert.equal(buffer.readInt32LE(r.offset),123);
});

for(const modern of [false,true])test(`a real ${modern?'authoritative':'legacy'} dig confirms without duplicate PlayerAction packets`,async t=>{
 const f=fixture(t),breaks=peer(f,{modern}),frame=pump(f,t),p=new Vec3(1,65,0);f.set(p,'stone');await f.b.dig(f.b.blockAt(p),undefined,undefined,{range:5,timeout:1500});frame();assert.equal(f.b.digState.confirmed,true);assert.equal(breaks.length,1);assert(inputActions(f.packets).every(a=>blockActionNames.has(a.action)));assert(inputActions(f.packets).some(a=>a.action==='stop_break'));assert(!f.packets.some(p=>p.name==='player_action'&&blockActionNames.has(p.params.action)));assert.equal(inputActions(f.packets).some(a=>a.action==='predict_break'),modern);
});

test('inventory authority does not override server block-breaking authority',async t=>{
 const f=fixture(t),breaks=peer(f,{modern:true});f.b.serverAuthoritativeInventory=false;assert.equal(digging.legacy(f.b),false);const frame=pump(f,t),p=new Vec3(1,65,0);f.set(p,'stone');await f.b.dig(f.b.blockAt(p),undefined,undefined,{timeout:1500});frame();assert.equal(breaks.length,1);assert(inputActions(f.packets).some(a=>a.action==='predict_break'));assert(!f.packets.some(p=>p.name==='inventory_transaction'&&p.params.transaction?.transaction_data?.action_type==='break_block'));
});

test('an unconfirmed dig refreshes terrain without sending get_updated_block and can retry',async t=>{
 const f=fixture(t);peer(f,{modern:false,confirm:false});const frame=pump(f,t),p=new Vec3(1,65,0),requests=[];f.set(p,'stone');f.b.worldMirror.request=(...args)=>requests.push(args);
 await assert.rejects(f.b.dig(f.b.blockAt(p),undefined,undefined,{timeout:750}));frame();assert(requests.length>0);assert(inputActions(f.packets).every(a=>blockActionNames.has(a.action)));assert(!f.packets.some(p=>p.name==='player_action'&&p.params.action==='get_updated_block'));assert.equal(f.b.actionHandBusy,false);
 peer(f,{modern:false,confirm:true});await f.b.dig(f.b.blockAt(p),undefined,undefined,{timeout:1500});assert(f.b.digState.confirmed);
});

test('kick cleanup cannot send or overwrite the packet that preceded the server kick',t=>{
 const f=fixture(t);f.b.pendingBreakActions=[{action:'continue_break',position:{x:1,y:65,z:0},face:1}];f.c.queue('player_auth_input',raw(1));const safety=require('../src/packet-safety'),last=structuredClone(f.b.lastGameplayPacket),count=f.packets.length;
 f.b.mining={x:1,y:65,z:0};f.b.digState={mode:'legacy',face:1};f.b.removeAllListeners('error');f.b.on('error',()=>{f.b.halt();f.c.queue('player_action',{action:'abort_break'});});f.c.emit('kick',{message:'Corrupted packet'});assert.equal(f.packets.length,count);assert.deepEqual(safety.exitPackets(f.b).last,last);assert.match(safety.lastLabel(f.b),/player_auth_input \(continue_break\)/);assert.equal(f.b.pendingBreakActions.length,0);
});
