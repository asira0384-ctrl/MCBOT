'use strict';
const {norm}=require('./util');
class TrailFollower{
 constructor(runtime){this.runtime=runtime;this.bot=runtime.bot;this.config=runtime.worker.state.follow=Object.assign({enabled:false,name:'',distance:2,speed:.21,mode:'trail'},runtime.worker.state.follow);this.points=[];this.cursor=0;this.state='OFF';this.lastSeen=0;this.onActor=a=>this.record(a);this.onDimension=()=>{this.points=[];this.cursor=0;this.lastSeen=0;this.state='同じ世界で対象を再検出するまで待機';};this.bot.on('actorAdded',this.onActor);this.bot.on('actorUpdated',this.onActor);this.bot.on('dimensionChanged',this.onDimension);}
 actor(){return [...this.bot.actors.values()].find(a=>a.player&&a.dimension===this.bot.dimensionId&&norm(a.name)===norm(this.config.name));}
 record(actor){if(!this.config.enabled||!actor.player||norm(actor.name)!==norm(this.config.name)||actor.dimension!==this.bot.dimensionId)return;const now=Date.now(),p=actor.position,last=this.points.at(-1);this.lastSeen=now;this.actorId=String(actor.id);
  if(last&&p.distanceTo(last.p)>12){this.points=[];this.cursor=0;this.state='対象のテレポートを検知・新しい位置へ再探索';}else if(last&&p.distanceTo(last.p)<.25)return;
  this.points.push({p:p.clone(),at:now});if(this.points.length>1200){const remove=Math.min(this.cursor,300);if(remove){this.points.splice(0,remove);this.cursor-=remove;}else{this.points=[{p:p.clone(),at:now}];this.cursor=0;}}
 }
 start(name,mode=this.config.mode){this.config.enabled=true;this.config.name=name;this.config.mode=['direct','trail'].includes(mode)?mode:'trail';this.lastSeen=0;this.actorId=null;this.points=[];this.cursor=0;this.state='対象を検出中';for(const a of this.bot.actors.values())this.record(a);}
 stop(){this.config.enabled=false;this.points=[];this.cursor=0;this.goal=null;this.state='OFF';if(['trail','follow-direct'].includes(this.runtime.travel.following?.kind))this.runtime.travel.stopFollowing();}
 tick(){if(!this.config.enabled)return false;const b=this.bot,t=this.runtime.travel,a=this.actor();if(a){require('./actors').refreshPlayer(b,a);this.record(a);}const latest=this.points.at(-1);if(!latest){t.stopFollowing();this.goal=null;this.state='対象の位置を受信するまで待機';return true;}
  const pose=t.embed?b.entity.position.offset(0,t.embed.original-b.entity.position.y,0):b.entity.position;if(pose.distanceTo(latest.p)<=this.config.distance){t.stopFollowing();this.goal=null;this.state=a?'距離を保って待機':'最後に見えた位置へ到着・再検出待ち';return true;}
  while(this.cursor<this.points.length-1&&pose.distanceTo(this.points[this.cursor].p)<.75)this.cursor++;
  this.goal=this.config.mode==='direct'?latest.p:this.points[this.cursor].p;const kind=this.config.mode==='direct'?'follow-direct':'trail';this.needsWork=!t.follow(this.goal,this.config.speed,kind,this.config.mode==='direct'?this.config.distance:.4);
  if(!this.progress||pose.distanceTo(this.progress.p)>.2){this.progress={p:pose.clone(),at:Date.now()};}else if(Date.now()-this.progress.at>2500){if(t.following)t.following.plannedAt=0;this.needsWork=true;}
  this.state=(this.config.mode==='direct'?'最短の経路で追従':'通った経路を追従')+` ${this.config.name}${!a?' / 最後に受信した位置':''}`;return true;
 }
 async work(signal){this.tick();if(!this.goal||!this.needsWork||this.bot.handUse||this.bot.actionHandBusy||Date.now()<(this.retryAt||0))return;
  try{await this.runtime.travel.walk(this.goal,'dig',signal);this.progress={p:this.bot.entity.position.clone(),at:Date.now()};this.error='';}catch(e){if(signal?.aborted)return;this.error=e.message;this.state='経路を再探索: '+e.message;this.retryAt=Date.now()+700;}
 }
 snapshot(){return {...this.config,config:{...this.config},waiting:this.state,state:this.state,points:this.points.length,cursor:this.cursor,lastSeen:this.lastSeen,error:this.error||null};}
 destroy(){this.bot.removeListener('actorAdded',this.onActor);this.bot.removeListener('actorUpdated',this.onActor);this.bot.removeListener('dimensionChanged',this.onDimension);}
}
module.exports={TrailFollower};
