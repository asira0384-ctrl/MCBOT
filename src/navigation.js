'use strict';
const {Vec3}=require('vec3');
const water=b=>b&&/^(flowing_)?water$/.test(b.name),danger=b=>!b||b.name==='unknown'||/lava|fire|magma|cactus/.test(b.name);
function pass(bot,p){for(const dy of [0,1]){const b=bot.blockAt(p.offset(0,dy,0));if(danger(b)||b.solid)return false;}return true;}
function search(start,goal,neighbors,{limit=900,radius=14}={}){const key=p=>`${p.x},${p.y},${p.z}`,h=p=>p.distanceTo(goal);const first={p:start,g:0,f:h(start),parent:null},open=[first],cost=new Map([[key(start),0]]);let best=first;
 for(let n=0;open.length&&n<limit;n++){open.sort((a,b)=>a.f-b.f);const at=open.shift();if(at.g!==cost.get(key(at.p)))continue;if(h(at.p)<h(best.p))best=at;if(h(at.p)<.7){best=at;break;}for(const edge of neighbors(at.p)){const p=edge.p;if(p.distanceTo(start)>radius)continue;const g=at.g+edge.cost,k=key(p);if(g>=(cost.get(k)??Infinity))continue;cost.set(k,g);open.push({p,g,f:g+h(p)*.95,parent:at,action:edge.action});}}
 if(best===first)return [];const result=[];for(let n=best;n.parent;n=n.parent)result.unshift({position:n.p,action:n.action});return result;
}
function airPath(bot,start,goal,clear,margin=1.3){return search(start,goal,p=>{const out=[];for(const [x,y,z]of [[1,0,0],[-1,0,0],[0,0,1],[0,0,-1],[0,1,0],[0,-1,0],[1,0,1],[1,0,-1],[-1,0,1],[-1,0,-1]]){const q=p.offset(x,y,z);if(clear(bot,p,q,margin))out.push({p:q,cost:Math.hypot(x,y,z)});}return out;},{radius:14,limit:700});}
function groundPath(bot,start,goal,{block=null}={}){start=start.floored();goal=goal.floored();return search(start,goal,p=>{const out=[];for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]])for(const dy of [0,1,-1]){const q=p.offset(dx,dy,dz);if(!pass(bot,q)||dy===1&&!pass(bot,p.offset(0,1,0)))continue;const under=bot.blockAt(q.offset(0,-1,0)),feet=bot.blockAt(q),head=bot.blockAt(q.offset(0,1,0));let action='walk',cost=1+(dy>0?3.5:dy<0?.6:0);
  if(water(feet)||water(under)){if(danger(head)||head?.solid)continue;action='swim';cost+=2.5;}else if(!under?.solid){if(!block||dy!==0||!under?.isAir)continue;const support=[[0,-1,0],[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]].some(([x,y,z])=>bot.blockAt(q.offset(x,y-1,z))?.solid);if(!support)continue;action='scaffold';cost+=2;}else if(danger(under))continue;
  if(dy===1&&(water(bot.blockAt(p))||water(bot.blockAt(p.offset(0,-1,0)))))action='shore';
  out.push({p:q,cost,action});break;
 }return out;},{radius:12,limit:600});}
module.exports={airPath,groundPath,water,pass};
