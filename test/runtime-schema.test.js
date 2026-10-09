'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const EventEmitter=require('node:events');const {Vec3}=require('vec3');const {Serializer,FullPacketParser}=require('protodef');const {correctedProtocol,patchRuntimeIds}=require('../src/runtime-schema');const {createSerializer,createDeserializer}=require('bedrock-protocol/src/transforms/serializer');const physics=require('../vendor/bedrockflayer/lib/physics/engine');
for(const version of ['1.21.2','1.26.51'])test(`MovePlayer ${version}: actual gateway 63-bit ID survives decoding and applies own reset`,()=>{
 const id=9223372036854775807n,proto=correctedProtocol(version),wire=new Serializer(proto,'mcpe_packet');
 const originalReader=createDeserializer(version),s=createSerializer(version),d=createDeserializer(version);patchRuntimeIds({options:{version},serializer:s,deserializer:d});
 const p={runtime_id:id,position:{x:128.5,y:2.13,z:128.5},pitch:0,yaw:0,head_yaw:0,mode:'reset',on_ground:true,ridden_runtime_id:0n,tick:1n};const bytes=wire.createPacketBuffer({name:'move_player',params:p});
 assert.equal(originalReader.parsePacketBuffer(bytes).data.params.runtime_id,-1);const decoded=d.parsePacketBuffer(bytes).data.params;assert.equal(decoded.runtime_id,id);assert.equal(decoded.ridden_runtime_id,0n);assert.deepEqual(s.createPacketBuffer({name:'move_player',params:decoded}),bytes);
 const bot=new EventEmitter();bot.client=new EventEmitter();bot._runtimeEntityId=id;bot.entity={position:new Vec3(128,68.38,128),velocity:new Vec3(0,0,0)};physics(bot);let corrections=0;bot.on('forcedMove',()=>corrections++);bot.client.emit('move_player',decoded);assert.equal(corrections,1);assert.equal(bot.entity.position.x,128.5);assert(Math.abs(bot.entity.position.y-.51)<.00001);
 bot.client.emit('move_player',{...decoded,runtime_id:id-1n,position:{x:999,y:99,z:999}});assert.equal(bot.entity.position.x,128.5);
});
