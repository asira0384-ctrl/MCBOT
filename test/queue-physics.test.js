'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const EventEmitter=require('node:events');const {Vec3}=require('vec3');
const physics=require('../vendor/bedrockflayer/lib/physics/engine');const {adaptInput}=require('../src/protocol');
test('queue idle ticks preserve server position; own normal/reset/teleport sync and foreign players are ignored',t=>{
 t.mock.timers.enable({apis:['setInterval']});
 const bot=new EventEmitter();bot.client=new EventEmitter();const sent=[];bot.client.queue=(name,data)=>sent.push(data);bot.physicsEnabled=true;bot.passivePhysics=true;bot.tick=0;bot._runtimeEntityId=7n;
 bot.entity={position:new Vec3(128,68.38,128),velocity:new Vec3(0,-3,0),onGround:false,yaw:0,pitch:0};bot.blockAt=()=>({name:'air'});physics(bot);let forced=0;bot.on('forcedMove',()=>forced++);bot.emit('spawn');
 for(let i=0;i<200;i++)t.mock.timers.tick(50);
 assert.equal(bot.entity.position.y,68.38);assert.equal(sent.length,200);assert.equal(sent.at(-1).delta.y,0);
 bot.client.emit('move_player',{runtime_id:99n,mode:'teleport',position:{x:9,y:9,z:9}});assert.equal(bot.entity.position.x,128);
 bot.client.emit('move_player',{runtime_id:7n,mode:'normal',position:{x:128,y:70,z:128}});assert.equal(forced,0);assert.equal(bot.entity.position.y,70-1.62);
 bot.client.emit('move_player',{runtime_id:7n,mode:'reset',position:{x:128,y:72,z:128},on_ground:true});assert.equal(forced,1);t.mock.timers.tick(50);assert.equal(sent.at(-1).delta.y,0);assert.equal(sent.at(-1).position.y,72);
 bot.client.emit('move_player',{runtime_id:7n,mode:2,position:{x:128,y:73,z:128}});assert.equal(forced,2);assert.equal(bot.pendingTeleport,true);
 bot.registry={protocol:{types:{}}};const first=adaptInput(bot,{input_data:0n});assert.equal(first.input_data.handled_teleport,true);assert.equal(adaptInput(bot,{input_data:0n}).input_data.handled_teleport,undefined);bot.emit('end');
});
