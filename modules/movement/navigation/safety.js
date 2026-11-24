'use strict';
const {Vec3}=require('vec3');
const water=b=>!!b&&/^(flowing_)?water$/.test(b.name);
const hazard=b=>!b||b.name==='unknown'||/lava|fire|magma|cactus|sweet_berry/.test(b.name);
const clear=b=>!!b&&!hazard(b)&&!b.solid;
const k=p=>`${p.x},${p.y},${p.z}`;
function body(bot,p){return clear(bot.blockAt(p))&&clear(bot.blockAt(p.offset(0,1,0)));}
function breathing(bot,p){const head=bot.blockAt(p.offset(0,1,0));return body(bot,p)&&!water(head);}
function dryStand(bot,p){const below=bot.blockAt(p.offset(0,-1,0));if(!breathing(bot,p)||water(bot.blockAt(p))||!below?.solid||hazard(below))return false;
 // Do not stop at a waterfall edge or beside a flowing body-level cell.
 for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]])for(const dy of [0,1]){const b=bot.blockAt(p.offset(dx,dy,dz));if(!b||hazard(b)||water(b))return false;}
 const above=bot.blockAt(p.offset(0,2,0));return !!above&&!hazard(above)&&!water(above);
}
function findEscape(bot,position,{radius=20,rise=24,maxNodes=6000}={}){
 const start=position.floored(),queue=[start],visited=new Set([k(start)]),parents=new Map();let breath=null;
 const path=end=>{const out=[];let p=end;while(p){out.unshift(p.offset(.5,0,.5));p=parents.get(k(p));}return out;};
 for(let i=0;i<queue.length&&i<maxNodes;i++){
  const p=queue[i];if(dryStand(bot,p))return {kind:'dry',path:path(p),goal:p};if(breath===null&&breathing(bot,p))breath=p;
  const wet=water(bot.blockAt(p))||water(bot.blockAt(p.offset(0,1,0)));
  const dirs=wet?[[0,1,0],[1,0,0],[-1,0,0],[0,0,1],[0,0,-1],[0,-1,0]]:[[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]];
  for(const [dx,dy,dz]of dirs){const q=p.offset(dx,dy,dz);if(Math.abs(q.x-start.x)>radius||Math.abs(q.z-start.z)>radius||q.y<start.y-2||q.y>start.y+rise||q.y<-64||q.y>318||visited.has(k(q))||!body(bot,q))continue;
   const targetWet=water(bot.blockAt(q))||water(bot.blockAt(q.offset(0,1,0))),below=bot.blockAt(q.offset(0,-1,0));
   if(dy!==0&&!wet)continue;
   if(!targetWet&&!below?.solid&&!wet)continue;
   // A dry-to-water edge must be supported or actually immersed. A swimmer
   // can only leave water by stepping/jumping one block onto confirmed land.
   if(!targetWet&&!below?.solid&&!water(bot.blockAt(q.offset(0,-1,0))))continue;
   visited.add(k(q));parents.set(k(q),p);queue.push(q);
  }
  // A one-block ledge at the water surface can be climbed with normal jump.
  for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]]){const q=p.offset(dx,1,dz);if(Math.abs(q.x-start.x)>radius||Math.abs(q.z-start.z)>radius||q.y>start.y+rise||visited.has(k(q))||!body(bot,p.offset(0,1,0))||!body(bot,q)||!bot.blockAt(q.offset(0,-1,0))?.solid)continue;visited.add(k(q));parents.set(k(q),p);queue.push(q);}
 }
 return breath?{kind:'breath',path:path(breath),goal:breath}:null;
}
class WaterSafety{
 constructor(runtime){this.runtime=runtime;this.bot=runtime.bot;this.pending=false;this.active=false;this.route=null;this.state='';this.bot.safety=this;}
 arm({resumeTravel=false}={}){this.resumeRoute=resumeTravel?this.runtime.travel.route:null;this.pending=true;this.active=false;this.route=null;this.armedAt=Date.now();this.nextSearch=0;this.state='リスポーン地点の水と足場を確認中';}
 cancel(){if(this.active){this.bot.clearControlStates();this.bot.naturalIdleFall=true;}this.pending=false;this.active=false;this.route=null;this.resumeRoute=null;this.state='';}
 invalidate(){this.route=null;this.nextSearch=0;}
 requestTerrain(){const b=this.bot,p=b.entity.position,w=b.worldMirror;if(!w?.request)return;const x=Math.floor(p.x)>>4,z=Math.floor(p.z)>>4,y=Math.floor(p.y)>>4;for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)w.request(x+dx,z+dz,y-1,y+2);}
 update(){const b=this.bot,r=this.runtime;if(!this.pending&&!this.active)return false;if(!b.connected||b.ended||b.dead||!b.entity){this.cancel();return false;}
  const p=b.entity.position,feet=b.blockAt(p),head=b.blockAt(p.offset(0,1.62,0));
  if(!this.active){if(!feet||!head){if(Date.now()>=(this.nextSearch||0)){this.requestTerrain();this.nextSearch=Date.now()+1000;}return false;}
   if(!water(feet)&&!water(head)){if(feet?.isAir&&b.blockAt(p.offset(0,-.1,0))?.solid||Date.now()-this.armedAt>10000){this.pending=false;this.state='水中ではありません';}return false;}
   this.wasPaused=!!r.paused;this.active=true;this.pending=false;r.abort?.abort();r.worker.stop();r.travel.cancel(false);r.receiving=false;r.paused=true;b.closeContainer();this.state='水中避難中';r.notice('水中から空気と乾いた足場へ泳いで避難します');
  }
  if(dryStand(b,p.floored())&&b.entity.onGround){b.clearControlStates();b.naturalIdleFall=true;this.active=false;this.route=null;this.state='乾いた足場へ避難済み';r.paused=this.wasPaused;if(this.resumeRoute){r.travel.route=this.resumeRoute;this.resumeRoute=null;}r.dirty=true;r.notice(`水中から避難しました。座標: ${Math.floor(p.x)} ${Math.floor(p.y)} ${Math.floor(p.z)}`);return false;}
  b.naturalIdleFall=false;
  if(!this.route||Date.now()-this.plannedAt>2500){if(Date.now()>=(this.nextSearch||0)){this.requestTerrain();this.route=findEscape(b,p);this.index=1;this.plannedAt=Date.now();this.nextSearch=Date.now()+1000;this.state=this.route?.kind==='dry'?'乾いた足場へ泳いで移動':this.route?'空気のある水面へ移動':'避難経路の地形受信待ち';}}
  b.clearControlStates();const path=this.route?.path;let target=path?.[Math.min(this.index,path.length-1)];
  while(target&&Math.hypot(p.x-target.x,p.z-target.z)<.35&&Math.abs(p.y-target.y)<1.15&&this.index<path.length-1)target=path[++this.index];
  if(target){if(p.distanceTo(target)>3.5){this.invalidate();return true;}b.lookAt(target.offset(0,1.62,0),false);b.setControlState('forward',Math.hypot(p.x-target.x,p.z-target.z)>.15);b.setControlState('jump',water(head)||target.y>p.y+.2&&!!b.blockAt(target.offset(0,-1,0))?.solid);}
  else {const above=b.blockAt(p.offset(0,2,0));b.setControlState('jump',water(head)&&clear(above));}
  return true;
 }
 snapshot(){return {active:this.active,pending:this.pending,state:this.state,goal:this.route?{kind:this.route.kind,position:this.route.goal}:null};}
}
module.exports={WaterSafety,findEscape,dryStand,breathing,water};
