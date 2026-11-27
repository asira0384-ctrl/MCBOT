'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {Vec3}=require('vec3');
const {fixture,peer}=require('./helpers/mining-world');

test('a reachable lower block across the chunk boundary beats a distant top target',async t=>{
 const {w,b,set,...rest}=fixture(t);
 Object.assign(w.state,{area:{x1:0,z1:0,x2:63,z2:15},floor:64,ceiling:70,miningRange:3,itemDrop:false});
 b.entity.position=new Vec3(15.5,65,5.5);
 w.running=true;w.runtime.travel.recoverCollision=async()=>false;
 const distant=new Vec3(30,70,5),near=new Vec3(16,65,5);
 set(distant,'stone');set(near,'stone');
 w.miner.prepare();
 w.miner.chunk=w.miner.chunkMap.get('1,0');
 w.miner.chunk.deferUntil=Date.now()+15000;
 w.miningTarget={name:'stone',position:{...distant}};
 w.approachPlan={targetKey:'0:30,70,5'};
 const breaks=peer({w,b,set,...rest});
 await w.tick();
 assert.equal(w.miner.selection,'nearby');
 assert.equal(b.blockAt(near).name,'air');
 assert.equal(b.blockAt(distant).name,'stone');
 assert.equal(breaks.length,1);
});

test('nearby mining respects the floor, block filters, claims and selected chunks',t=>{
 const {w,b,set}=fixture(t);
 Object.assign(w.state,{area:{x1:0,z1:0,x2:31,z2:15},floor:64,ceiling:67,miningRange:3,miningChunks:[[0,0]],miningFilter:['stone']});
 b.entity.position=new Vec3(15.5,65,5.5);
 set(new Vec3(16,65,5),'stone');
 set(new Vec3(15,65,4),'dirt');
 set(new Vec3(14,65,5),'stone');
 w.manager.claims.set(b.dimensionId+':14,65,5',2);
 assert.equal(w.chooseTarget(),null);
});

test('a miner crosses 10–20 blocks of cleared floor and then resumes breaking blocks',async t=>{
 for(const distance of [10,20]){
  const f=fixture(t);
  const {w,b,travel,set}=f;
  Object.assign(w.state,{area:{x1:0,z1:0,x2:31,z2:4},floor:64,ceiling:70,miningRange:3,itemDrop:false});
  b.entity.position=new Vec3(.5,65,.5);
  w.running=true;
  travel.recoverCollision=async()=>false;
  travel.moveStep=async point=>{b.entity.position=point.clone();};
  const high=new Vec3(distance,70,0),alongTheFloor=new Vec3(distance,65,1);
  set(high,'stone');set(alongTheFloor,'stone');
  const breaks=peer(f);
  for(let i=0;i<35&&!breaks.length;i++)await w.tick();
  assert(b.entity.position.x>=distance-3,'should walk near the next group of blocks');
  assert.equal(b.blockAt(alongTheFloor).name,'air');
  assert.equal(breaks.length,1);
 }
});
