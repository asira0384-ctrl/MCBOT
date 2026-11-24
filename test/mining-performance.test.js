'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3');
const {fixture}=require('./helpers/mining-world');
test('six miners bound terrain reads across a 1024-chunk region',t=>{
 const fleet=Array.from({length:6},()=>fixture(t));let total=0;
 for(const f of fleet){f.w.state.area={x1:0,x2:511,z1:0,z2:511};f.w.state.ceiling=65;f.w.running=true;let reads=0;const blockAt=f.b.blockAt;f.b.blockAt=p=>{reads++;return blockAt(p);};f.w.miner.scan();assert(f.w.miner.metrics.reads<=2048);assert(reads<2500);assert.equal(f.w.miner.done,false);total+=reads;}
 t.diagnostic('Six-bot first survey terrain reads: '+total+'; legacy budget was 49152 before visibility checks');
});
test('joining or pausing peers does not discard surveyed layers',t=>{
 const f=fixture(t);f.w.running=true;f.w.miner.prepare();const chunk=f.w.miner.allChunks[0];chunk.layer=65;chunk.dirty=false;
 const peer={id:2,state:f.w.state,bot:f.b,running:true};f.w.manager.workers.set(2,peer);f.w.miner.prepare();assert.equal(f.w.miner.allChunks[0],chunk);assert.equal(chunk.layer,65);assert.equal(chunk.dirty,false);
 peer.running=false;f.w.miner.prepare();assert.equal(f.w.miner.allChunks[0],chunk);
});
test('cached terrain is invalidated by block updates and visibility checks are bounded',t=>{
 const f=fixture(t);f.w.state.area={x1:0,x2:15,z1:0,z2:15};f.w.state.floor=64;f.w.state.ceiling=65;f.b.entity.position=new Vec3(20.5,65,20.5);f.w.running=true;
 for(let x=0;x<16;x++)for(let z=0;z<16;z++)f.set(new Vec3(x,65,z),'stone');
 let checks=0;f.b.reach=()=>true;f.b.visible=()=>{checks++;return true;};const a=f.w.miner.scan();assert(a);assert(checks<=12);assert(f.w.miner.cache.size<=64);
 f.set(a.position,'air');const next=f.w.miner.scan();assert(next);assert.notDeepEqual(next.position,a.position);
});
test('a present pickaxe resumes supply waiting even without a new inventory event',async t=>{
 const f=fixture(t);f.w.mode='waiting';f.w.running=false;f.w.lastReceive=0;f.r.travel.recoverCollision=async()=>false;f.w.discard=async()=>{};f.w.chooseTarget=()=>null;f.w.explore=async()=>{};
 await f.w.tick();assert.equal(f.w.running,true);assert.equal(f.w.mode,'running');
});
test('snapshot retains per-account confirmed totals, including offline accounts',()=>{
 const {WebControl}=require('../src/web');const states=new Map([[1,{stats:{total:100},session:{total:20}}],[2,{stats:{total:300},session:{total:40}}]]);
 const manager={names:new Map([[1,'One'],[2,'Two']]),workers:new Map(),logs:new Map(),store:{data:{},bot:id=>states.get(id)}};
 const result=WebControl.prototype.snapshot.call({manager,env:{},now:()=>1,audit:[]});assert.equal(result.bots.reduce((sum,b)=>sum+b.miningTotals.total,0),400);assert.equal(result.bots.reduce((sum,b)=>sum+b.miningTotals.session,0),60);assert(result.bots.every(b=>!b.connected));
});
test('far unloaded chunks do not block mining a received nearby top layer',t=>{
 const f=fixture(t);f.w.state.area={x1:0,x2:511,z1:0,z2:511};f.w.state.floor=64;f.w.state.ceiling=65;f.w.running=true;f.set(new Vec3(1,65,0),'stone');
 const original=f.b.blockAt;f.b.blockAt=p=>p.x>=128||p.z>=128?{name:'unknown',position:p.floored()}:original(p);
 const target=f.w.miner.scan();assert(target);assert.equal(target.position.x,1);assert.equal(target.position.y,65);assert(f.w.miner.allChunks.some(c=>c.dirty));
});
