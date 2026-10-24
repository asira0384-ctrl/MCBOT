'use strict';
const assert=require('node:assert/strict');
const {Vec3}=require('vec3');const {adapter}=require('./adapter'),{Travel}=require('../../src/travel'),{Worker}=require('../../src/worker'),{ChunkMining}=require('../../src/mining');
function fixture(t,{physics=false}={}){
 const f=adapter(t),{b,c,packets,item}=f,cells=new Map(),key=p=>`${Math.floor(p.x)},${Math.floor(p.y)},${Math.floor(p.z)}`;
 b.blockAt=p=>{p=new Vec3(p.x,p.y,p.z).floored();const name=cells.get(key(p))||(p.y===64?'stone':'air'),solid=name!=='air',entry=b.registry.blocksByName[name];return {name,position:p,stateId:entry.defaultState,solid,isAir:!solid,isLiquid:false,boundingBox:solid?'block':'empty',shapes:solid?[[0,0,0,1,1,1]]:[],diggable:entry.diggable!==false,hardness:entry.hardness??1};};
 const set=(p,name)=>{cells.set(key(p),name);b.emit('worldUpdate',p);};
 b.entity.position=new Vec3(.5,65,.5);b.entity.velocity=new Vec3(0,0,0);b.entity.onGround=true;b.health=20;b.terrainReady=true;b.terrainEstablished=true;b.serverAuthoritativeInventory=false;b.items[1]=item('netherite_pickaxe',11);b.breakTime=()=>60;
 const zero=()=>({total:0,obsidian:0,other:0,byBlock:{}}),manager={workers:new Map(),claims:new Map(),assigned:()=>true,store:{save(){}},notice(){}},w=Object.assign(Object.create(Worker.prototype),{id:1,bot:b,manager,state:{floor:64,ceiling:68,area:{x1:-10,z1:-10,x2:12,z2:12},scaffold:'cobblestone',owned:{},miningFilter:[],stats:zero(),session:zero(),minedItems:[]},running:false,busy:false,mode:'stopped',failed:new Map(),missing:'',lastEat:0});
 manager.workers.set(1,w);w.miner=new ChunkMining(w);const r={bot:b,worker:w,manager,config:{anticrystal:false,blockReach:5},paused:false,notice(){},protectAnti:()=>false};r.travel=new Travel(r);w.runtime=r;t.after(()=>w.miner.destroy());
 if(physics){b.physicsEnabled=true;b.emit('spawn');}
 return {...f,cells,set,key,w,r,travel:r.travel};
}
function peer(f,{modern=false,confirm=true}={}){
 const {b,c,packets,set}=f,queue=c.queue.bind(c),breaks=[];b.serverBreak=true;b.serverAuthoritativeInventory=modern;
 c.queue=(name,data)=>{const result=queue(name,data),p=packets.at(-1);if(name==='inventory_transaction'&&data.transaction?.transaction_data?.action_type==='break_block'){
  breaks.push(p);if(confirm)queueMicrotask(()=>set(new Vec3(...['x','y','z'].map(k=>data.transaction.transaction_data.block_position[k])),'air'));
 }if(modern&&name==='player_auth_input'&&p?.params.block_action?.some(a=>a.action==='predict_break')){
  assert(p.params.item_stack_request,'prediction must carry its durability request in the same input');const action=p.params.block_action.find(a=>a.action==='predict_break');breaks.push(p);if(confirm)queueMicrotask(()=>set(new Vec3(action.position.x,action.position.y,action.position.z),'air'));
 }return result;};return breaks;
}

module.exports={fixture,peer};
