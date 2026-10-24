'use strict';
const {Vec3}=require('vec3');
const AABB=require('../vendor/bedrockflayer/lib/physics/aabb');
const {getSurroundingBBs}=require('../vendor/bedrockflayer/lib/physics/collision');
const water=b=>b&&/^(flowing_)?water$/.test(b.name),danger=b=>!b||b.name==='unknown'||/lava|fire|magma|cactus/.test(b.name);
function pass(bot,p){for(const dy of [0,1]){const b=bot.blockAt(p.offset(0,dy,0));if(danger(b))return false;}const box=AABB.fromPlayer(p.offset(.5,0,.5),.6,1.8);return !getSurroundingBBs(bot,box).some(b=>box.intersects(b));}
class MinHeap{
 constructor(){this.values=[];}get length(){return this.values.length;}
 push(value){const a=this.values;a.push(value);let i=a.length-1;while(i){const parent=(i-1)>>1;if(a[parent].f<=value.f)break;a[i]=a[parent];i=parent;}a[i]=value;}
 shift(){const a=this.values,first=a[0],last=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let child=i*2+1;if(child+1<a.length&&a[child+1].f<a[child].f)child++;if(a[child].f>=last.f)break;a[i]=a[child];i=child;}a[i]=last;}return first;}
}
function search(start,goal,neighbors,{limit=900,radius=14,stopRadius=.7}={}){const key=p=>`${p.x},${p.y},${p.z}`,h=p=>p.distanceTo(goal);const first={p:start,g:0,f:h(start),parent:null},open=new MinHeap(),cost=new Map([[key(start),0]]);open.push(first);let best=first;
 for(let n=0;open.length&&n<limit;n++){const at=open.shift();if(at.g!==cost.get(key(at.p)))continue;if(h(at.p)<h(best.p))best=at;if(h(at.p)<stopRadius){best=at;break;}for(const edge of neighbors(at.p)){const p=edge.p;if(p.distanceTo(start)>radius)continue;const g=at.g+edge.cost,k=key(p);if(g>=(cost.get(k)??Infinity))continue;cost.set(k,g);open.push({p,g,f:g+h(p)*.95,parent:at,action:edge.action});}}
 if(best===first)return [];const result=[];for(let n=best;n.parent;n=n.parent)result.unshift({position:n.p,action:n.action});return result;
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
function groundPath(bot,start,goal,{block=null,dig=false,canDig=()=>true,stopRadius=.7,limit=700,radius=14,blocked=()=>false}={}){
 start=start.floored();goal=goal.floored();const memo=new Map(),source=bot;bot={blockAt:p=>{const k=`${Math.floor(p.x)},${Math.floor(p.y)},${Math.floor(p.z)}`;if(!memo.has(k))memo.set(k,source.blockAt(p));return memo.get(k);}};
 return search(start,goal,p=>{const out=[];
  for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]])for(const dy of [0,1,-1]){
   const q=p.offset(dx,dy,dz),under=bot.blockAt(q.offset(0,-1,0)),feet=bot.blockAt(q),head=bot.blockAt(q.offset(0,1,0));let breaking=false;
   if(blocked(p,q))continue;
   if(!pass(bot,q)){
    if(!dig||dy!==0||[feet,head].some(b=>!b||danger(b)||b.name==='unknown'||b.solid&&(!b.diggable||b.hardness<0||!canDig(b))))continue;
    if(![feet,head].some(b=>b.solid))continue;breaking=true;
   }
   if(dy===1&&!pass(bot,p.offset(0,1,0)))continue;
   let action=breaking?'dig':dy===1?'jump':'walk',cost=1+(dy>0?3.5:dy<0?.6:0)+(breaking?8:0);
   if(water(feet)||water(under)){if(danger(head)||head?.solid)continue;action='swim';cost+=2.5;}
   else if(!under?.solid){if(!block||dy<0||!under?.isAir)continue;const support=[[0,-1,0],[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]].some(([x,y,z])=>bot.blockAt(q.offset(x,y-1,z))?.solid);if(!support)continue;action='scaffold';cost+=3;}
   else if(danger(under))continue;
   if(dy===1&&(water(bot.blockAt(p))||water(bot.blockAt(p.offset(0,-1,0)))))action='shore';out.push({p:q,cost,action});break;
  }
  if(block&&goal.y>p.y+1&&pass(bot,p.offset(0,1,0))&&bot.blockAt(p.offset(0,-1,0))?.solid&&!water(bot.blockAt(p)))out.push({p:p.offset(0,1,0),cost:4.5,action:'pillar'});
  return out;
 },{radius,limit,stopRadius});
}

module.exports={airDetour,airPath,groundPath,water,pass};
