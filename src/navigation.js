'use strict';
const {Vec3}=require('vec3');
const AABB=require('../vendor/bedrockflayer/lib/physics/aabb');
const {getSurroundingBBs}=require('../vendor/bedrockflayer/lib/physics/collision');
const water=b=>b&&/^(flowing_)?water$/.test(b.name),danger=b=>!b||b.name==='unknown'||/lava|fire|magma|cactus/.test(b.name);
const lava=b=>b&&/^(flowing_)?lava$/.test(b.name);
function pass(bot,p,allowLava=false){for(const dy of [0,1]){const b=bot.blockAt(p.offset(0,dy,0));if(danger(b)&&!(allowLava&&lava(b)))return false;}const box=AABB.fromPlayer(p.offset(.5,0,.5),.6,1.8);return !getSurroundingBBs(bot,box).some(b=>box.intersects(b));}
class MinHeap{
 constructor(){this.values=[];}get length(){return this.values.length;}
 push(value){const a=this.values;a.push(value);let i=a.length-1;while(i){const parent=(i-1)>>1;if(a[parent].f<=value.f)break;a[i]=a[parent];i=parent;}a[i]=value;}
 shift(){const a=this.values,first=a[0],last=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let child=i*2+1;if(child+1<a.length&&a[child+1].f<a[child].f)child++;if(a[child].f>=last.f)break;a[i]=a[child];i=child;}a[i]=last;}return first;}
}
function search(start,goal,neighbors,{limit=900,radius=14,stopRadius=.7,horizontal=false,riseBias=0}={}){const key=p=>`${p.x},${p.y},${p.z}`,h=p=>p.distanceTo(goal);const first={p:start,g:0,f:h(start),parent:null},open=new MinHeap(),cost=new Map([[key(start),0]]);open.push(first);let best=first;
 for(let n=0;open.length&&n<limit;n++){const at=open.shift();if(at.g!==cost.get(key(at.p)))continue;if(h(at.p)<h(best.p))best=at;if(h(at.p)<stopRadius){best=at;break;}for(const edge of neighbors(at.p,at)){const p=edge.p;if((horizontal?Math.hypot(p.x-start.x,p.z-start.z):p.distanceTo(start))>radius)continue;const g=at.g+edge.cost,k=key(p);if(g>=(cost.get(k)??Infinity))continue;cost.set(k,g);open.push({p,g,f:g+h(p)*.95+Math.max(0,goal.y-p.y)*riseBias,parent:at,action:edge.action,changes:edge.changes});}}
 const result=[];for(let n=best;n.parent;n=n.parent)result.unshift({position:n.p,action:n.action});Object.defineProperties(result,{reached:{value:h(best.p)<stopRadius},cost:{value:best.g},remaining:{value:h(best.p)},radius:{value:radius},placements:{value:result.filter(n=>['scaffold','pillar'].includes(n.action)).length}});return result;
}
function airPath(bot,start,goal,clear,margin=1.3){return search(start,goal,p=>{const out=[];for(const [x,y,z]of [[1,0,0],[-1,0,0],[0,0,1],[0,0,-1],[0,1,0],[0,-1,0],[1,0,1],[1,0,-1],[-1,0,1],[-1,0,-1]]){const q=p.offset(x,y,z);if(clear(bot,p,q,margin))out.push({p:q,cost:Math.hypot(x,y,z)});}return out;},{radius:14,limit:700});}
function airDetour(bot,start,goal,clear,margin=1.3){
 const delta=goal.minus(start),length=Math.hypot(delta.x,delta.z);if(length<2)return null;
 const forward=new Vec3(delta.x/length,0,delta.z/length),side=new Vec3(-forward.z,0,forward.x),plans=[];
 // Deliberately allow an initial move away from the goal. A nearest-only local
 // search cannot escape a large flat wall when both its ends are beyond 14m.
 for(const distance of [4,8,12,20,32,48,64])for(const direction of [0,1,-1]){
  const offset=direction===0?new Vec3(0,distance,0):side.scaled(distance*direction),stage=start.plus(offset);
  if(stage.y>315||!clear(bot,start,stage,margin))continue;
  for(const advance of [6,12,24,48,Math.min(length,64)]){
   const across=stage.plus(forward.scaled(advance));if(!clear(bot,stage,across,margin))continue;
   const direct=clear(bot,across,goal,margin),progress=start.distanceTo(goal)-across.distanceTo(goal);
   if(!direct&&progress<1)continue;
   plans.push({path:[{position:stage},{position:across}],cost:distance+advance+across.distanceTo(goal)+(direct?0:8)});
  }
 }
 plans.sort((a,b)=>a.cost-b.cost);return plans[0]?.path||null;
}
// A long descent is an ordinary fall, never a position override. Stop at the
// first obstruction, unknown cell or liquid; do not invent a floor below it.
function dropLanding(bot,entry,maxDrop=3,clear=q=>pass(bot,q)){
 if(!clear(entry))return null;
 for(let d=1;d<=Math.min(384,Math.max(0,maxDrop));d++){
  const q=entry.offset(0,-d,0),feet=bot.blockAt(q),under=bot.blockAt(q.offset(0,-1,0));
  if(danger(feet)||danger(under)||!clear(q))return null;
  if(water(feet)||water(under))return d===1?q:null;
  if(under.solid)return q;
 }return null;
}
function groundPath(source,start,goal,{block=null,dig=false,canDig=()=>true,stopRadius=.7,limit=900,radius,blocked=()=>false,jumpGaps=true,maxDrop=3,preferGround=true,minY=-64,allowLava=false}={}){
 start=start.floored();goal=goal.floored();radius??=Math.min(96,Math.max(14,Math.ceil(Math.hypot(goal.x-start.x,goal.z-start.z))+4));
 if(block&&preferGround){const natural=groundPath(source,start,goal,{dig,canDig,stopRadius,limit,radius,blocked,jumpGaps,maxDrop,minY,allowLava});if(natural.reached&&natural.cost<=Math.hypot(goal.x-start.x,goal.z-start.z)*1.8+Math.max(0,start.y-goal.y)*.03+4)return natural;}
 const memo=new Map(),plans=new WeakMap(),passMaps=new WeakMap(),key=p=>`${Math.floor(p.x)},${Math.floor(p.y)},${Math.floor(p.z)}`;
 const actual=p=>{const k=key(p);if(!memo.has(k))memo.set(k,source.blockAt(p));return memo.get(k);};
 const changes=at=>{if(!at)return new Map();if(plans.has(at))return plans.get(at);const own=at.changes?.length?new Map(changes(at.parent)):changes(at.parent);for(const [p,value]of at.changes||[])own.set(key(p),value);plans.set(at,own);return own;};
 const empty=p=>({name:'air',position:p,solid:false,isAir:true,shapes:[],boundingBox:'empty'}),support=p=>({name:block?.name||'cobblestone',position:p,solid:true,isAir:false,shapes:[[0,0,0,1,1,1]],boundingBox:'block',diggable:true,hardness:2});
 return search(start,goal,(p,at)=>{const virtual=changes(at),bot={blockAt:q=>virtual.has(key(q))?virtual.get(key(q)):actual(q)},out=[];
  if(!passMaps.has(virtual))passMaps.set(virtual,new Map());const cache=passMaps.get(virtual),clear=q=>{const k=key(q);if(!cache.has(k))cache.set(k,pass(bot,q,allowLava));return cache.get(k);};
  // Compare every safe level. A flat scaffold must not hide an existing step
  // down, which used to leave the bot building above a lower mining layer.
  for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]]){
   const landing=dropLanding(bot,p.offset(dx,0,dz),maxDrop,clear),levels=landing?[0,1,landing.y-p.y]:[0,1];
   for(const dy of levels){
   const q=p.offset(dx,dy,dz),under=bot.blockAt(q.offset(0,-1,0)),feet=bot.blockAt(q),head=bot.blockAt(q.offset(0,1,0)),edits=[];let breaking=false;
   if(q.y<minY||blocked(p,q)||danger(under)&&!(allowLava&&lava(under)))continue;
   if(!clear(q)){
    if(!dig||dy!==0||[feet,head].some(b=>danger(b)||b.solid&&(!b.diggable||b.hardness<0||!canDig(b))))continue;
    if(![feet,head].some(b=>b.solid))continue;breaking=true;for(const b of [feet,head])if(b.solid)edits.push([b.position,empty(b.position)]);
   }
   if(dy===1&&!clear(p.offset(0,1,0)))continue;
   let action=breaking?'dig':dy===1?'jump':dy<0?'drop':'walk',cost=1+(dy>0?3.5:dy<0?-.03*dy:0)+(breaking?8:0);
   if(allowLava&&(lava(feet)||lava(under))){if(head?.solid||danger(head)&&!lava(head)||dy< -1)continue;action='lava';cost+=1.5;}
   else if(water(feet)||water(under)){if(danger(head)||head?.solid||dy< -1)continue;action='swim';cost+=2.5;}
   else if(!under?.solid){
    if(!block||dy<0||!under?.isAir)continue;
    if(/^(sand|red_sand|gravel|.*concrete_powder)$/.test(block.name)&&!bot.blockAt(q.offset(0,-2,0))?.solid)continue;
    const attached=[[0,-1,0],[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]].some(([x,y,z])=>bot.blockAt(q.offset(x,y-1,z))?.solid);if(!attached)continue;
    // Never build a bridge at the old height to reach a lower nearby layer.
    if(goal.y<p.y-1)continue;action='scaffold';cost+=7;edits.push([q.offset(0,-1,0),support(q.offset(0,-1,0))]);
   }
   if(dy===1&&(water(bot.blockAt(p))||water(bot.blockAt(p.offset(0,-1,0)))))action='shore';out.push({p:q,cost,action,changes:edits});
  }}
  if(jumpGaps&&bot.blockAt(p.offset(0,-1,0))?.solid&&!water(bot.blockAt(p))&&pass(bot,p.offset(0,1,0))){
   for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]])for(const distance of [2,3]){
    const q=p.offset(dx*distance,0,dz*distance);if(blocked(p,q)||!pass(bot,q)||!bot.blockAt(q.offset(0,-1,0))?.solid||danger(bot.blockAt(q.offset(0,-1,0))))continue;
    let gap=false,clear=true;for(let i=1;i<distance;i++){const q=p.offset(dx*i,0,dz*i);if(!pass(bot,q)||!pass(bot,q.offset(0,1,0))||danger(bot.blockAt(q.offset(0,-1,0)))){clear=false;break;}if(!bot.blockAt(q.offset(0,-1,0))?.solid)gap=true;}
    if(clear&&gap&&pass(bot,q.offset(0,1,0)))out.push({p:q,cost:distance+1.5,action:'jump-gap'});
   }
  }
  if(block&&goal.y>p.y&&pass(bot,p.offset(0,1,0))&&bot.blockAt(p.offset(0,-1,0))?.solid&&!water(bot.blockAt(p)))out.push({p:p.offset(0,1,0),cost:9,action:'pillar',changes:[[p,support(p)]]});
  return out;
 },{radius,limit,stopRadius,horizontal:true,riseBias:block?8:0});
}

module.exports={airDetour,airPath,groundPath,dropLanding,water,pass};
