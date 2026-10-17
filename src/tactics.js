'use strict';
const {Vec3}=require('vec3');
const {norm}=require('./util');
function sameRealm(a,b){return a.dimensionId===b.dimensionId&&a.config?.host===b.config?.host&&Number(a.config?.port)===Number(b.config?.port);}
function friend(runtime,name){const n=norm(name);return [...(runtime.manager.names?.values()||[])].some(v=>norm(v)===n)||(runtime.manager.store?.data?.friends||[]).some(v=>norm(v.name||v)===n)||(runtime.manager.store?.data?.admins||[]).some(v=>norm(v.name)===n);}
function eligible(runtime,actor){
 if(!actor?.player||!actor.position||actor.dimension!==runtime.bot.dimensionId||String(actor.id)===String(runtime.bot._runtimeEntityId)||friend(runtime,actor.name))return false;
 const entry=(runtime.manager.store?.data?.enemies||[]).find(e=>norm(e.name)===norm(actor.name));
 if(entry)return !entry.xuid||runtime.bot.players.get(norm(actor.name))?.xuid===entry.xuid;
 if(runtime.config.attackAll&&actor.position.distanceTo(runtime.bot.entity.position)<=30)return true;
 return runtime.config.assist&&[...(runtime.manager.workers?.values()||[])].some(w=>w.runtime&&w.runtime!==runtime&&!w.runtime.paused&&sameRealm(w.bot,runtime.bot)&&w.bot.connected&&w.bot.entity?.position.distanceTo(runtime.bot.entity.position)<=30&&w.runtime.target&&norm(w.runtime.target.name)===norm(actor.name)&&Date.now()-(w.runtime.engagedAt||0)<2000);
}
function target(runtime,range){
 const b=runtime.bot;
 for(const a of b.actors?.values()||[])require('./actors').refreshPlayer(b,a);
 return [...(b.actors?.values()||[])].filter(a=>eligible(runtime,a)&&a.position.distanceTo(b.entity.position)<=range).sort((a,c)=>a.position.distanceTo(b.entity.position)-c.position.distanceTo(b.entity.position))[0]||null;
}
function ray(bot,from,to){return require('./geometry').rayClear(bot,from,to);}
// Geometry estimate, not a promise of damage: server plugins, armor and effects
// may change damage. Unknown terrain is occluded, never assumed to be air.
function explosionDamage(bot,point,position){
 const distance=point.distanceTo(position.offset(0,.9,0))/12;if(distance>=1)return 0;
 let exposed=0,total=0;for(const y of [.1,.9,1.7])for(const [x,z]of [[-.24,-.24],[-.24,.24],[.24,-.24],[.24,.24]]){total++;if(ray(bot,point,position.offset(x,y,z)))exposed++;}
 const impact=(1-distance)*exposed/total;return impact<=0?0:(impact*impact+impact)*42+1;
}
function blastScore(runtime,point,enemy){
 const b=runtime.bot,damage=explosionDamage(b,point,enemy.position),self=explosionDamage(b,point,b.entity.position);
 if(!damage)return null;
 for(const a of b.actors?.values()||[])if(a.player&&friend(runtime,a.name)&&explosionDamage(b,point,a.position)>4)return null;
 return {damage,self,score:damage-self*.5};
}
function retreat(runtime,enemy){
 const b=runtime.bot,p=runtime.travel.embed?new Vec3(b.entity.position.x,runtime.travel.embed.original,b.entity.position.z):b.entity.position;
 if(!enemy)return null;const away=p.minus(enemy.position),length=Math.hypot(away.x,away.z)||1,options=[];
 for(const angle of [0,Math.PI/4,-Math.PI/4,Math.PI/2,-Math.PI/2]){
  const dx=(away.x*Math.cos(angle)-away.z*Math.sin(angle))/length,dz=(away.x*Math.sin(angle)+away.z*Math.cos(angle))/length;
  const goal=p.offset(dx*5,0,dz*5),path=require('./navigation').groundPath(b,p,goal,{limit:160,radius:7});
  if(!path.length||path[0].action==='scaffold')continue;
  const last=path.at(-1).position;options.push({goal,score:last.distanceTo(enemy.position)-path.length*.1});
 }
 return options.sort((a,c)=>c.score-a.score)[0]?.goal||null;
}
class Telemetry{
 constructor(bot){this.bot=bot;this.samples=[];this.value={bps:0,verticalBps:0};this.resetAt=0;}
 reset(){this.samples=[];this.value={bps:0,verticalBps:0};this.resetAt=Date.now();}
 sample(now=Date.now()){
  const p=this.bot.entity?.position;if(!p)return this.value;
  const last=this.samples.at(-1);if(last&&now-last.at<100)return this.value;
  if(last&&p.distanceTo(last.p)>8){this.reset();}
  this.samples.push({at:now,p:p.clone()});this.samples=this.samples.filter(s=>now-s.at<=1200);const first=this.samples[0],dt=(now-first.at)/1000;
  if(dt>.1)this.value={bps:+(Math.hypot(p.x-first.p.x,p.z-first.p.z)/dt).toFixed(2),verticalBps:+((p.y-first.p.y)/dt).toFixed(2)};
  return this.value;
 }
}
function nearby(runtime){
 const b=runtime.bot;if(!b.entity||!b.connected)return [];
 const rows=new Map(),item=raw=>raw?{name:b.name(raw),count:raw.count||1}:null;
 for(const a of b.actors?.values()||[])if(a.player&&a.dimension===b.dimensionId){rows.set(norm(a.name),{id:a.name,runtimeId:String(a.id),distance:+a.position.distanceTo(b.entity.position).toFixed(1),position:a.position,friend:friend(runtime,a.name),bot:false,observedAt:a.seen,armor:(a.armor||[null,null,null,null]).map(item),mainhand:item(a.mainhand),offhand:item(a.offhand)});}
 for(const w of runtime.manager.workers?.values()||[]){const other=w.bot;if(other===b||!other.connected||!other.entity||!sameRealm(b,other))continue;const distance=other.entity.position.distanceTo(b.entity.position);if(distance>128)continue;rows.set(norm(other.username),{id:other.username,bot:true,friend:true,distance:+distance.toFixed(1),position:other.entity.position,observedAt:Date.now(),armor:(other.armor||[]).map(raw=>raw?{name:other.name(raw),count:raw.count||1}:null),mainhand:other.items?.[other.quickBarSlot]?{name:other.name(other.items[other.quickBarSlot]),count:other.items[other.quickBarSlot].count}:null,offhand:other.offhand?.[0]?{name:other.name(other.offhand[0]),count:1}:null});}
 return [...rows.values()].sort((a,c)=>a.distance-c.distance).slice(0,100);
}
module.exports={sameRealm,friend,eligible,target,ray,explosionDamage,blastScore,retreat,Telemetry,nearby};
