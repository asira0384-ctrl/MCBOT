'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const EventEmitter=require('node:events');const {Vec3}=require('vec3');
const physics=require('../vendor/bedrockflayer/lib/physics/engine');const {adaptInput}=require('../src/protocol');
test('stopped controls allow natural falling; own corrections sync and foreign players are ignored',t=>{
 t.mock.timers.enable({apis:['setInterval']});
 const bot=new EventEmitter();bot.client=new EventEmitter();const sent=[];bot.client.queue=(name,data)=>sent.push(data);bot.physicsEnabled=true;bot.passivePhysics=true;bot.tick=0;bot._runtimeEntityId=7n;
 bot.entity={position:new Vec3(128,68.38,128),velocity:new Vec3(0,-3,0),onGround:false,yaw:0,pitch:0};bot.blockAt=()=>({name:'air'});physics(bot);let forced=0;bot.on('forcedMove',()=>forced++);bot.emit('spawn');
 for(let i=0;i<20;i++)t.mock.timers.tick(50);
 assert(bot.entity.position.y<68.38);assert.equal(sent.length,20);assert(sent.at(-1).delta.y<0);assert.equal(bot.entity.position.x,128);assert.equal(sent.at(-1).move_vector.x,0);assert.equal(sent.at(-1).move_vector.y,0);
 bot.client.emit('move_player',{runtime_id:99n,mode:'teleport',position:{x:9,y:9,z:9}});assert.equal(bot.entity.position.x,128);
 bot.client.emit('move_player',{runtime_id:7n,mode:'normal',position:{x:128,y:70,z:128}});assert.equal(forced,0);assert.equal(bot.entity.position.y,70-1.62);
 bot.client.emit('move_player',{runtime_id:7n,mode:'reset',position:{x:128,y:72,z:128},on_ground:true});assert.equal(forced,1);t.mock.timers.tick(50);assert.equal(sent.at(-1).delta.y,0);assert.equal(sent.at(-1).position.y,72);
 bot.client.emit('move_player',{runtime_id:7n,mode:2,position:{x:128,y:73,z:128}});assert.equal(forced,2);assert.equal(bot.pendingTeleport,true);
 bot.registry={protocol:{types:{}}};const first=adaptInput(bot,{input_data:0n});assert.equal(first.input_data.handled_teleport,true);assert.equal(adaptInput(bot,{input_data:0n}).input_data.handled_teleport,undefined);bot.emit('end');
});
test('idle loading continues gravity with missing terrain and restarts after authoritative queue teleports',t=>{
 t.mock.timers.enable({apis:['setInterval']});
 const b=new EventEmitter();b.client=new EventEmitter();const sent=[];b.client.queue=(name,p)=>sent.push(p);b.physicsEnabled=true;b.naturalIdleFall=true;b.tick=0;b._runtimeEntityId=9223372036854775807n;
 b.entity={position:new Vec3(128.5,.51,128.5),velocity:new Vec3(0,0,0),onGround:false,yaw:0,pitch:0};b.blockAt=()=>null;physics(b);b.emit('spawn');
 for(let cycle=0;cycle<3;cycle++){
  for(let i=0;i<32;i++)t.mock.timers.tick(50);
  assert(b.entity.position.y<-27,'gravity must pass the observed rollback depth without a client-side limit');assert.equal(b.entity.position.x,128.5);assert.equal(b.entity.position.z,128.5);assert(sent.at(-1).delta.y<0);
  b.client.emit('move_player',{runtime_id:b._runtimeEntityId,mode:'teleport',position:{x:128.5,y:2.13,z:128.5},on_ground:false});
  assert(Math.abs(b.entity.position.y-.51)<1e-6);assert.equal(b.entity.velocity.y,0);assert(b._lastSentPos.equals(b.entity.position));
  t.mock.timers.tick(50);assert(b.entity.position.y<.51);assert(Math.abs(sent.at(-1).delta.y)<1,'rollback must not create a fabricated upward delta');
 }
 b.emit('end');
});
test('natural idle falling lands on received floor; active movement still waits for missing terrain',t=>{
 t.mock.timers.enable({apis:['setInterval']});const b=new EventEmitter();b.client=new EventEmitter();b.client.queue=()=>{};b.physicsEnabled=true;b.naturalIdleFall=true;b.tick=0;
 b.entity={position:new Vec3(.5,4,.5),velocity:new Vec3(0,0,0),onGround:false,yaw:0,pitch:0};b.blockAt=p=>({name:Math.floor(p.y)===0?'stone':'air',solid:Math.floor(p.y)===0});physics(b);b.emit('spawn');
 for(let i=0;i<60;i++)t.mock.timers.tick(50);assert(Math.abs(b.entity.position.y-1)<1e-6,'received floor must stop falling');
 b.naturalIdleFall=false;b.blockAt=()=>null;b.entity.velocity.y=-1;const y=b.entity.position.y;t.mock.timers.tick(50);assert.equal(b.entity.position.y,y);assert.equal(b.entity.velocity.y,0);b.emit('end');
});
