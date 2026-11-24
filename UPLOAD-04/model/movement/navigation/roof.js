'use strict';
const {Vec3}=require('vec3');
const {airDetour,airPath}=require('./navigation');
const knownAir=b=>b&&!b.solid&&!b.isLiquid&&!/unknown|lava|fire/.test(b.name);
function ceiling(bot,p){
 for(let y=Math.ceil(p.y+1.8);y<=Math.min(315,p.y+128);y++){
  const block=bot.blockAt({x:p.x,y,z:p.z});if(!block||block.name==='unknown')return null;
  if(!['obsidian','bedrock'].includes(block.name))continue;
  let top=y;while(top<319&&bot.blockAt({x:p.x,y:top+1,z:p.z})?.solid)top++;
  return {bottom:y,top};
 }return null;
}
function pathTo(bot,from,to,clear,margin){
 if(clear(bot,from,to,margin))return [to];
 const plan=airDetour(bot,from,to,clear,margin)||airPath(bot,from,to,clear,margin);
 if(!plan?.length)return null;const points=plan.map(n=>n.position);
 if(!clear(bot,points.at(-1),to,margin))return null;return [...points,to];
}
function opening(bot,p,roof,clear,margin,enter=false,radius=28){
 const candidates=[];
 for(let dx=-radius;dx<=radius;dx++)for(let dz=-radius;dz<=radius;dz++){
  const x=Math.floor(p.x)+dx+.5,z=Math.floor(p.z)+dz+.5;
  if(!knownAir(bot.blockAt({x,y:roof.bottom,z}))||!knownAir(bot.blockAt({x,y:roof.top,z})))continue;
  const low=new Vec3(x,Math.min(p.y,roof.bottom-3),z),high=new Vec3(x,Math.max(roof.top+2.5,enter?p.y:0),z);
  if(!clear(bot,low,high,margin))continue;
  candidates.push({low,high,cost:Math.hypot(x-p.x,z-p.z)});
 }
 for(const q of candidates.sort((a,b)=>a.cost-b.cost).slice(0,20)){
  const level=new Vec3(q.low.x,p.y,q.low.z),approach=pathTo(bot,p,level,clear,margin);
  if(approach)return {path:[...approach,enter?q.low:q.high],hole:q.low};
 }return null;
}
// Each search is limited to loaded nearby terrain. When no opening is known,
// visit another reachable area; never invent an air shaft through the roof.
class RoofNavigator{
 constructor(bot,goal,roof,clear,margin){this.bot=bot;this.goal=goal.clone();this.roof=roof;this.clear=clear;this.margin=margin;this.phase='exit';this.points=[];this.visited=new Set();this.scanAt=0;this.searches=0;}
 request(p){const w=this.bot.worldMirror;if(!w?.request)return;const cy=Math.floor(p.y/16),top=Math.floor((this.roof.top+5)/16);for(const [dx,dz]of [[0,0],[1,0],[-1,0],[0,1],[0,-1]])w.request((p.x>>4)+dx,(p.z>>4)+dz,Math.min(cy,top),Math.max(cy,top));}
 next(p){
  if(this.phase==='exit'&&!this.points.length&&p.y>this.roof.bottom-3){const down=new Vec3(p.x,this.roof.bottom-3,p.z);if(this.clear(this.bot,p,down,.3))return down;}
  while(this.points.length&&this.points[0].distanceTo(p)<.25)this.points.shift();
  if(this.points.length)return this.points[0];
  if(this.phase==='exit-done'){this.phase='cruise';this.points=[new Vec3(this.goal.x,Math.max(p.y,this.roof.top+2.5),this.goal.z)];return this.points[0];}
  if(this.phase==='cruise'){
   if(this.goal.y>=this.roof.top+2.5){this.phase='done';return this.goal;}
   this.phase='entry';
  }
  if(this.phase==='entry-done'||this.phase==='done'){this.phase='done';return this.goal;}
  if(Date.now()<this.scanAt)return p.clone();this.scanAt=Date.now()+800;this.searches++;this.request(p);
  const enter=this.phase==='entry',found=opening(this.bot,p,this.roof,this.clear,this.margin,enter);
  if(found){this.hole=found.hole;this.phase=enter?'entry-done':'exit-done';this.points=found.path;return this.points[0];}
  const here=`${Math.round(p.x/8)},${Math.round(p.z/8)}`;this.visited.add(here);
  const plans=[];for(const distance of [8,16,24])for(const [dx,dz]of [[1,0],[0,1],[-1,0],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]){
   const q=p.offset(dx*distance,0,dz*distance),key=`${Math.round(q.x/8)},${Math.round(q.z/8)}`;
   if(Math.abs(q.x)>540||Math.abs(q.z)>540||this.visited.has(key)||enter&&Math.hypot(q.x-this.goal.x,q.z-this.goal.z)>48)continue;
   if(this.clear(this.bot,p,q,this.margin))plans.push({q,key,cost:q.distanceTo(this.goal)*.1+distance});
  }
  const plan=plans.sort((a,b)=>a.cost-b.cost)[0];if(plan){this.visited.add(plan.key);this.points=[plan.q];return plan.q;}return p.clone();
 }
 snapshot(){return {phase:this.phase,roof:this.roof,hole:this.hole||null,searches:this.searches,visited:this.visited.size};}
}
module.exports={ceiling,opening,RoofNavigator};
