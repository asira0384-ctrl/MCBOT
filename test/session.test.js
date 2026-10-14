'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const EventEmitter=require('node:events');const {Vec3}=require('vec3');
const {installSession}=require('../src/session');const {adaptInput}=require('../src/protocol');const physics=require('../vendor/bedrockflayer/lib/physics/engine');const {World}=require('../src/world');const {BedrockBot}=require('../src/bedrock');
const {createSerializer,createDeserializer}=require('bedrock-protocol/src/transforms/serializer');
function fixture(version){const b=new EventEmitter();b.client=new EventEmitter();b.client.options={version};b.registry=require('prismarine-registry')('bedrock_'+version);b._runtimeEntityId=9223372036854775807n;b.entity={position:new Vec3(128,68.38,128),velocity:new Vec3(0,0,0)};b.controlState={};b.connected=true;b.passivePhysics=true;b.sent=[];b.client.queue=(name,params)=>b.sent.push({name,params});b.worldMirror=new World(b);b.halt=()=>{b.passivePhysics=true;};physics(b);installSession(b);return b;}
for(const version of ['1.21.2','1.26.51'])test(`session ${version}: own teleport response on wire, no foreign ACK, terrain precedes dimension ACK`,()=>{
 const b=fixture(version),s=createSerializer(version),d=createDeserializer(version);
 b.client.emit('move_player',{runtime_id:b._runtimeEntityId-1n,mode:'teleport',position:{x:1,y:2,z:3}});assert.equal(b.sent.length,0);
 b.client.emit('move_player',{runtime_id:b._runtimeEntityId,mode:'teleport',position:{x:128.5,y:2.13,z:128.5}});
 assert.equal(b.sent[0].params.action,'handled_teleport');assert.equal(b.sent[0].params.runtime_entity_id,b._runtimeEntityId);
 const decoded=d.parsePacketBuffer(s.createPacketBuffer(b.sent[0])).data.params;assert.equal(decoded.runtime_entity_id,b._runtimeEntityId);assert.equal(decoded.action,'handled_teleport');assert.equal(decoded.position.y,0);
 b.emit('terrainDecoded');assert.equal(b.initialDataAcknowledged,false,'no ACK before successful decode');b.terrainReady=true;b.emit('terrainDecoded');b.emit('terrainDecoded');assert.equal(b.sessionResponses.received_server_data,1);
 b.worldMirror.columns.set('8,8',{});b.worldMirror.known.add('8,0,8');b.worldMirror.overrides.set('1,1,1',1);
 b.client.emit('change_dimension',{dimension:1,position:{x:5,y:71.62,z:9}});assert.equal(b.dimensionId,1);assert.equal(b.terrainReady,false);assert.equal(b.worldMirror.columns.size,0);assert.equal(b.worldMirror.known.size,0);assert.equal(b.worldMirror.overrides.size,0);assert.equal(b.sessionResponses.dimension_change_ack,undefined);
 b.terrainReady=true;b.emit('terrainDecoded');assert.equal(b.sessionResponses.dimension_change_ack,1);assert.equal(b.sessionResponses.received_server_data,2);
 for(const p of b.sent.filter(p=>p.name==='player_action'))assert.equal(d.parsePacketBuffer(s.createPacketBuffer(p)).data.params.action,p.params.action);
 const base={position:{x:5,y:71.62,z:9},input_data:0n,tick:1n,move_vector:{x:0,y:0},analogue_move_vector:{x:0,y:0},delta:{x:0,y:0,z:0}};
 const input=d.parsePacketBuffer(s.createPacketBuffer({name:'player_auth_input',params:adaptInput(b,base)})).data.params;
 assert(Array.isArray(input.input_data)?input.input_data.includes('received_server_data'):input.input_data.received_server_data);
 assert.equal(b.pendingServerData,false);
});
test('queued old dimension payload cannot repopulate the new world',async()=>{
 const b=fixture('1.26.51');b.worldGeneration=1;let ran=false;let release;b.worldMirror.loading=new Promise(r=>{release=r;});
 BedrockBot.prototype.decode.call(b,()=>{ran=true;});b.worldGeneration++;release();await b.worldMirror.loading;assert.equal(ran,false);
});
