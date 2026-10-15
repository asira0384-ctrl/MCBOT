'use strict';
const {Vec3}=require('vec3');
const water=b=>b&&/^(flowing_)?water$/.test(b.name),danger=b=>!b||b.name==='unknown'||/lava|fire|magma|cactus/.test(b.name);
function pass(bot,p){for(const dy of [0,1]){const b=bot.blockAt(p.offset(0,dy,0));if(danger(b)||b.solid)return false;}return true;}
function search(start,goal,neighbors,{limit=900,radius=14}={}){const key=p=>`${p.x},${p.y},${p.z}`,h=p=>p.distanceTo(goal);const first={p:start,g:0,f:h(start),parent:null},open=[first],cost=new Map([[key(start),0]]);let best=first;
 for(let n=0;open.length&&n<limit;n++){open.sort((a,b)=>a.f-b.f);const at=open.shift();if(at.g!==cost.get(key(at.p)))continue;if(h(at.p)<h(best.p))best=at;if(h(at.p)<.7){best=at;break;}for(const edge of neighbors(at.p)){const p=edge.p;if(p.distanceTo(start)>radius)continue;const g=at.g+edge.cost,k=key(p);if(g>=(cost.get(k)??Infinity))continue;cost.set(k,g);open.push({p,g,f:g+h(p)*.95,parent:at,action:edge.action});}}
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
function groundPath(bot,start,goal,{block=null}={}){start=start.floored();goal=goal.floored();return search(start,goal,p=>{const out=[];for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]])for(const dy of [0,1,-1]){const q=p.offset(dx,dy,dz);if(!pass(bot,q)||dy===1&&!pass(bot,p.offset(0,1,0)))continue;const under=bot.blockAt(q.offset(0,-1,0)),feet=bot.blockAt(q),head=bot.blockAt(q.offset(0,1,0));let action='walk',cost=1+(dy>0?3.5:dy<0?.6:0);
  if(water(feet)||water(under)){if(danger(head)||head?.solid)continue;action='swim';cost+=2.5;}else if(!under?.solid){if(!block||dy!==0||!under?.isAir)continue;const support=[[0,-1,0],[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]].some(([x,y,z])=>bot.blockAt(q.offset(x,y-1,z))?.solid);if(!support)continue;action='scaffold';cost+=2;}else if(danger(under))continue;
  if(dy===1&&(water(bot.blockAt(p))||water(bot.blockAt(p.offset(0,-1,0)))))action='shore';
  out.push({p:q,cost,action});break;
 }return out;},{radius:12,limit:600});}
module.exports={airDetour,airPath,groundPath,water,pass};
