'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const dgram=require('node:dgram');const bedrock=require('bedrock-protocol');
async function freePort(){const s=dgram.createSocket('udp4');await new Promise((resolve,reject)=>{s.once('error',reject);s.bind(0,'127.0.0.1',resolve);});const p=s.address().port;await new Promise(resolve=>s.close(resolve));return p;}
test('Native RakNet real UDP discovery and Bedrock handshake match the advertised protocol', {timeout:15000},async t=>{
 const port=await freePort();const server=new bedrock.Server({host:'127.0.0.1',port,version:'1.26.51',offline:true,raknetBackend:'raknet-native',transport:'raknet',maxPlayers:2});
 let client;t.after(async()=>{client?.close();await server.close();});
 const errors=[];server.on('error',e=>errors.push(e));server.on('connect',p=>p.on('error',e=>errors.push(e)));
 await server.listen();const pong=await bedrock.ping({host:'127.0.0.1',port,transport:'raknet',timeout:3000});assert.equal(pong.protocol,String(require('bedrock-protocol/src/options').Versions['1.26.51']));
 client=bedrock.createClient({host:'127.0.0.1',port,offline:true,username:'LocalTransportTest',raknetBackend:'raknet-native',transport:'raknet',conLog:()=>{},connectTimeout:5000});client.prependOnceListener('connect_allowed',()=>require('../src/runtime-schema').patchRuntimeIds(client));
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('local Bedrock handshake timed out')),8000);client.once('join',()=>{clearTimeout(timer);resolve();});client.once('error',e=>{clearTimeout(timer);reject(e);});});
 assert.equal(client.runtimeIdSchema,'move_player:uint64');assert.equal(client.options.version,'1.26.51');assert.equal(errors.length,0);
});
