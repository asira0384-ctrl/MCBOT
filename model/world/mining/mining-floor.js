'use strict';
const {Vec3}=require('vec3');
const {air,solid,key}=require('../../../src/shared/util');
const navigation=require('../../movement/navigation/navigation');
const {placementSupport}=require('../../../src/shared/geometry');

const directions=[[1,0],[-1,0],[0,1],[0,-1]];
function material(w){
 const names=[w.state.scaffold,'netherrack','cobblestone','stone','dirt','obsidian'];
 return names.map(name=>w.bot.find(name)).find(Boolean);
}

async function recover(w,signal){
 const b=w.bot,base=b.entity.position.floored(),travel=w.runtime.travel;
 w.miningPhase='floor-recovery';
 w.missing='床の高さへ戻る経路を確認中';
 if(!b.entity.onGround)return;
 const goals=[];
 for(let dx=-4;dx<=4;dx++)for(let dz=-4;dz<=4;dz++){
  const q=base.offset(dx,1,dz);
  if(solid(b.blockAt(q.offset(0,-1,0)))&&navigation.pass(b,q))goals.push(q);
 }
 goals.sort((a,c)=>a.distanceTo(base)-c.distanceTo(base));
 for(const goal of goals.slice(0,8)){
  const options=travel.groundOptions({minY:base.y,maxDrop:1,limit:160,signal});
  const path=await navigation.groundPathAsync(b,base,goal,options);
  if(path.reached){await travel.walk(goal.offset(.5,0,.5),'walk',signal,{minY:base.y,allowScaffold:false,maxDrop:1});return;}
 }
 const item=w.state.scaffoldEnabled!==false&&material(w);
 if(item&&!navigation.pass(b,base.offset(0,1,0))){
  for(const [dx,dz] of directions){
   const step=base.offset(dx,0,dz),goal=step.offset(0,1,0);
   if(!w.inArea(new Vec3(goal.x,w.state.floor+1,goal.z))||!navigation.pass(b,goal)||!air(b.blockAt(step))||!placementSupport(b,step))continue;
   await w.placeOwned(step,item,'scaffold',signal,{timeout:1800});
   await travel.walk(goal.offset(.5,0,.5),'walk',signal,{minY:base.y,allowScaffold:false,maxDrop:0});return;
  }
 }
 if(!navigation.pass(b,base.offset(0,1,0))){
  const overhead=b.blockAt(base.offset(0,2,0));
  if(overhead?.diggable&&w.inArea(overhead.position)&&require('./mining').wanted(w,overhead)&&!w.underPlayer(overhead.position,{ignoreSelf:true})){
   await travel.breakObstacle(overhead,signal);return;
  }
 }
 if(!item){w.missing='上がれる道がなく、足場ブロックの補給またはScaffold ONを待っています';w.miningRetryAt=Date.now()+1500;return;}
 if(!navigation.pass(b,base.offset(0,1,0))){
  for(let radius=1;radius<=4;radius++)for(let dx=-radius;dx<=radius;dx++)for(let dz=-radius;dz<=radius;dz++){
   if(Math.max(Math.abs(dx),Math.abs(dz))!==radius)continue;
   const q=base.offset(dx,0,dz);
   if(!solid(b.blockAt(q.offset(0,-1,0)))||!navigation.pass(b,q)||!navigation.pass(b,q.offset(0,1,0)))continue;
   const path=await navigation.groundPathAsync(b,base,q,travel.groundOptions({minY:base.y,maxDrop:1,limit:100,signal}));
   if(path.reached){await travel.walk(q.offset(.5,0,.5),'walk',signal,{minY:base.y,allowScaffold:false,maxDrop:1});return;}
  }
 }
 await travel.pillar(item,signal);
}

async function finish(w,signal){
 const b=w.bot,p=b.entity.position,travel=w.runtime.travel,y=w.state.floor;
 w.miningPhase='floor-repair';
 const chunks=w.miner.allChunks;
 if(!w.floorSurvey)w.floorSurvey={complete:new Set(),retry:new Map()};
 const survey=w.floorSurvey,now=Date.now();
 const pending=chunks.filter(c=>!survey.complete.has(c));
 if(!pending.length)return true;
 const distance=c=>Math.hypot(Math.max(c.x1-p.x,0,p.x-c.x2),Math.max(c.z1-p.z,0,p.z-c.z2));
 const assigned=new Set(w.miner.chunks);
 const c=pending.filter(c=>(survey.retry.get(c)||0)<=now).sort((a,b)=>Number(assigned.has(b))-Number(assigned.has(a))||distance(a)-distance(b))[0];
 if(!c)return false;
 const holes=[],unknown=[];
 for(let x=c.x1;x<=c.x2;x++)for(let z=c.z1;z<=c.z2;z++){
  const q=new Vec3(x,y,z),block=b.blockAt(q);
  if(!block||block.name==='unknown')unknown.push(q);
  else if(air(block))holes.push(q);
 }
 if(!holes.length&&!unknown.length){survey.complete.add(c);return false;}
 holes.sort((a,c)=>p.distanceTo(a)-p.distanceTo(c));
 if(unknown.length)b.worldMirror?.request(c.x,c.z,y>>4,(y+2)>>4);
 const item=material(w);
 for(const q of holes){
  if(p.distanceTo(q)>7)break;
  if(w.manager.claims.has(b.dimensionId+':'+key(q))||require('./mining').columnBusy(w,q)||!placementSupport(b,q))continue;
  if(!item){w.missing='床を埋めるブロックの補給待ち';w.miningRetryAt=now+1500;return false;}
  try{await w.placeOwned(q,item,'floor',signal,{timeout:2200});w.missing='';return false;}
  catch(error){if(signal?.aborted)throw error;w.missing=error.message;survey.retry.set(c,Date.now()+2000);return false;}
 }
 const targets=holes.length?holes:unknown;
 const stances=new Map();
 for(const q of targets)for(const [dx,dz] of directions){
  const stand=q.offset(dx,1,dz);
  if(solid(b.blockAt(stand.offset(0,-1,0)))&&navigation.pass(b,stand)){
   const spot=stand.offset(.5,0,.5);if(p.distanceTo(spot)>.4)stances.set(key(stand),spot);
  }
 }
 const goals=[...stances.values()].sort((a,c)=>p.distanceTo(a)-p.distanceTo(c));
 if(!goals.length&&unknown.length&&distance(c)>6)goals.push(new Vec3((c.x1+c.x2+1)/2,p.y,(c.z1+c.z2+1)/2));
 for(const goal of goals.slice(0,4)){
  try{await travel.walk(goal,'walk',signal,{minY:y+1,allowScaffold:true,maxDrop:1});w.missing='床の穴の縁へ移動中';return false;}
  catch(error){if(signal?.aborted)throw error;w.missing=error.message;}
 }
 w.missing=unknown.length?'床の地形受信待ち':'床の穴へ届く足場を再探索中';
 survey.retry.set(c,Date.now()+2000);
 return false;
}
module.exports={finish,recover};
