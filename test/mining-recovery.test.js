'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3');
const life=require('../modules/world/mining/mining-lifecycle'),{Worker}=require('../src/app/worker'),{ConnectionKeeper}=require('../src/app/connection-keeper'),{fixture}=require('./helpers/mining-world');
function worker(state){const bot={connected:true,ended:false,terrainReady:true,health:20,dimensionId:0,config:{host:'server.test',port:19132},client:{startGameData:{world_name:'main'}},halt(){}};return Object.assign(Object.create(Worker.prototype),{id:1,bot,state,manager:{changed(){}},miner:{reset(){}},busy:false,controlBusy:false});}
test('mining ON survives an unexpected disconnect and resumes on the same loaded world',()=>{
 const s={area:{x1:0,x2:5,z1:0,z2:5},floor:64,ceiling:70};const first=worker(s);first.start();assert.equal(s.nukeEnabled,true);first.stop();assert.equal(s.nukeEnabled,true);
 const reconnected=worker(s);reconnected.resumeOnConnect=true;reconnected.bot.terrainReady=false;assert.equal(life.resume(reconnected),false);assert(!reconnected.running);reconnected.bot.terrainReady=true;assert(life.resume(reconnected));assert(reconnected.running);assert.equal(reconnected.resumeOnConnect,false);
});
test('resume waits for manual forms and never mines in a different world; explicit OFF cancels it',()=>{
 const s={area:{x1:0,x2:5,z1:0,z2:5},floor:64,ceiling:70},first=worker(s);first.start();const next=worker(s);next.resumeOnConnect=true;next.bot.pendingServerForm={};assert.equal(life.resume(next),false);delete next.bot.pendingServerForm;next.bot.config.host='other.test';assert.equal(life.resume(next),false);next.bot.config.host='server.test';next.bot.dimensionId=1;assert.equal(life.resume(next),false);next.bot.dimensionId=0;next.bot.client.startGameData.world_name='lobby';assert.equal(life.resume(next),false);next.bot.client.startGameData.world_name='main';life.disable(s);assert.equal(life.resume(next),false);
});
test('a mining start deferred by a busy hand still retains the ON intent across disconnect',()=>{
 const s={area:{x1:0,x2:5,z1:0,z2:5},floor:64,ceiling:70},first=worker(s);first.busy=true;assert.equal(first.start(),false);assert.equal(s.nukeEnabled,true);assert.equal(first.startRequested,true);first.stop();const next=worker(s);next.resumeOnConnect=true;assert(life.resume(next));assert.equal(next.running,true);
});
test('short reconnects keep backoff counts instead of repeatedly resetting them at spawn',()=>{
 const scheduled=[],cancelled=[],state={connectionWanted:true};const m={store:{bot:()=>state,save(){}},names:new Map([[1,'Bot']]),workers:new Map([[1,{bot:{connected:true}}]])};const k=new ConnectionKeeper(m,{schedule:(fn,ms)=>{const t={fn,ms};scheduled.push(t);return t;},cancel:t=>cancelled.push(t)});k.attempts.set(1,3);k.connected(1);assert.equal(k.attempts.get(1),3);assert.equal(scheduled[0].ms,30000);m.workers.get(1).bot.connected=false;k.lost(1);assert.equal(k.attempts.get(1),3);assert(cancelled.includes(scheduled[0]));assert.equal(scheduled.at(-1).ms,16000);k.stop();
});
test('a usable current-session auth flow permits reconnect without a saved refresh token',async()=>{
 let requested=0;const s={connectionWanted:true},m={store:{bot:()=>s,save(){}},names:new Map([[1,'Bot']]),workers:new Map(),accounts:{snapshot:()=>({saved:false,state:'ready'}),flow:()=>({})},requestConnection(){requested++;},connectRequests:new Map(),connectionResults:new Map()};const k=new ConnectionKeeper(m);await k.connect(1);assert.equal(requested,1);k.stop();
});
test('range 5 checks block surface; out-of-range blocks require movement rather than remote breaking',async t=>{
 const f=fixture(t);f.b.entity.position=new Vec3(.5,65,.5);f.w.state.miningRange=5;f.set(new Vec3(5,66,0),'stone');f.set(new Vec3(6,66,0),'stone');const near=f.b.blockAt(new Vec3(5,66,0)),far=f.b.blockAt(new Vec3(6,66,0));assert(f.b.reach(near,5));assert(!f.b.reach(far,5));f.w.running=true;f.w.state.area={x1:0,x2:10,z1:0,z2:0};let approached=0,dug=0;f.w.chooseTarget=()=>far;f.w.discard=async()=>{};f.w.approach=async target=>{assert.equal(target,far);approached++;};f.b.dig=async()=>dug++;f.r.travel.recoverCollision=async()=>false;await f.w.tick();assert.equal(approached,1);assert.equal(dug,0);
});
test('mining requests only the current two height sections and a received lower section does not reset progress',t=>{
 const f=fixture(t),requests=[];f.w.running=true;f.w.miner.prepare();const c=f.w.miner.allChunks[0];c.layer=66;f.b.worldMirror.request=(...args)=>requests.push(args);f.w.miner.request(c);assert.equal(requests.length,1);assert.equal(requests[0][3],4);assert(requests[0][3]-requests[0][2]<=1);c.layer=65;f.b.emit('terrainColumn',{x:c.x,z:c.z,top:127,section:7});assert.equal(c.layer,65);
});
