'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const dgram=require('node:dgram');const bedrock=require('bedrock-protocol');
async function freePort(){const s=dgram.createSocket('udp4');await new Promise((resolve,reject)=>{s.once('error',reject);s.bind(0,'127.0.0.1',resolve);});const p=s.address().port;await new Promise(resolve=>s.close(resolve));return p;}
test('Native RakNet real UDP discovery and Bedrock handshake match the advertised protocol', {timeout:15000},async t=>{
 const port=await freePort();const server=new bedrock.Server({host:'127.0.0.1',port,version:'1.26.51',offline:true,raknetBackend:'raknet-native',transport:'raknet',maxPlayers:2});
 let client;t.after(async()=>{client?.close();await server.close();});
 let peer;const errors=[];server.on('error',e=>errors.push(e));server.on('connect',p=>{peer=p;p.on('error',e=>errors.push(e));});require('../src/runtime-schema').patchRuntimeIds(server);
 await server.listen();const pong=await bedrock.ping({host:'127.0.0.1',port,transport:'raknet',timeout:3000});assert.equal(pong.protocol,String(require('bedrock-protocol/src/options').Versions['1.26.51']));
 client=bedrock.createClient({host:'127.0.0.1',port,offline:true,username:'LocalTransportTest',raknetBackend:'raknet-native',transport:'raknet',conLog:()=>{},connectTimeout:5000});client.prependOnceListener('connect_allowed',()=>require('../src/runtime-schema').patchRuntimeIds(client));
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('local Bedrock handshake timed out')),8000);client.once('join',()=>{clearTimeout(timer);resolve();});client.once('error',e=>{clearTimeout(timer);reject(e);});});
 assert.equal(client.runtimeIdSchema,'move_player:uint64');assert.equal(client.options.version,'1.26.51');assert.equal(errors.length,0);
 // Replay the gateway's real 63-bit teleport over encrypted UDP, then verify
 // the server receives our response (not merely that a codec round-trips).
 const EventEmitter=require('node:events'),{Vec3}=require('vec3');const bot=new EventEmitter();bot.client=client;bot._runtimeEntityId=9223372036854775807n;bot.registry=require('prismarine-registry')('bedrock_1.26.51');bot.entity={position:new Vec3(128,68.38,128),velocity:new Vec3(0,0,0)};bot.connected=true;bot.passivePhysics=true;
 require('../vendor/bedrockflayer/lib/physics/engine')(bot);require('../src/session').installSession(bot);
 const ack=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('teleport response never reached local server')),3000);peer.once('player_action',p=>{clearTimeout(timer);resolve(p);});});
 peer.write('move_player',{runtime_id:bot._runtimeEntityId,position:{x:128.5,y:2.13,z:128.5},pitch:0,yaw:0,head_yaw:0,mode:'teleport',on_ground:true,ridden_runtime_id:0n,teleport:{cause:'command',source_entity_type:'player'},tick:10n});
 const received=await ack;assert.equal(received.action,'handled_teleport');assert.equal(received.runtime_entity_id,bot._runtimeEntityId);assert.equal(bot.entity.position.x,128.5);assert.equal(bot.sessionResponses.handled_teleport,1);assert.equal(errors.length,0);
});
