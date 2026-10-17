'use strict';
const {norm}=require('./util');
class TrailFollower{
 constructor(runtime){this.runtime=runtime;this.bot=runtime.bot;this.config=runtime.worker.state.follow=Object.assign({enabled:false,name:'',distance:2,speed:.21},runtime.worker.state.follow);this.points=[];this.cursor=0;this.state='OFF';this.lastSeen=0;this.onActor=a=>this.record(a);this.onDimension=()=>{this.points=[];this.cursor=0;this.lastSeen=0;this.state='同じ世界で対象を再検出するまで待機';};this.bot.on('actorAdded',this.onActor);this.bot.on('actorUpdated',this.onActor);this.bot.on('dimensionChanged',this.onDimension);}
 record(actor){if(!this.config.enabled||!actor.player||norm(actor.name)!==norm(this.config.name)||actor.dimension!==this.bot.dimensionId)return;const now=Date.now(),p=actor.position,last=this.points.at(-1);this.lastSeen=now;this.actorId=String(actor.id);if(last&&p.distanceTo(last.p)>12){this.points=[];this.cursor=0;this.state='対象のテレポートを検知・新しい経路から追従';}else if(last&&p.distanceTo(last.p)<.25)return;
  this.points.push({p:p.clone(),at:now});if(this.points.length>1200){const remove=Math.min(this.cursor,300);if(remove){this.points.splice(0,remove);this.cursor-=remove;}else{this.points=[];this.cursor=0;this.points.push({p:p.clone(),at:now});this.state='記録範囲を更新・現在の対象位置へ接近';}}
 }
 start(name){this.config.enabled=true;this.config.name=name;this.lastSeen=0;this.actorId=null;this.points=[];this.cursor=0;this.state='対象を検出中';for(const a of this.bot.actors.values())this.record(a);}
 stop(){this.config.enabled=false;this.points=[];this.cursor=0;this.state='OFF';if(this.runtime.travel.following?.kind==='trail')this.runtime.travel.stopFollowing();}
 tick(){if(!this.config.enabled)return false;const b=this.bot,t=this.runtime.travel;if(!this.lastSeen||Date.now()-this.lastSeen>6000){const a=[...b.actors.values()].find(a=>a.player&&norm(a.name)===norm(this.config.name)&&Date.now()-a.seen<6000);if(a)this.record(a);else{t.stopFollowing();this.state='対象の新しい位置を受信するまで待機';return true;}}
  const pose=t.embed?b.entity.position.offset(0,t.embed.original-b.entity.position.y,0):b.entity.position,latest=this.points.at(-1);if(!latest)return true;
  // Stop behind the observed player without throwing away the intermediate
  // corners. Resume those same breadcrumbs when the player moves again.
  if(pose.distanceTo(latest.p)<=this.config.distance){t.stopFollowing();this.state='距離を保って待機';return true;}
  while(this.cursor<this.points.length-1&&pose.distanceTo(this.points[this.cursor].p)<.65)this.cursor++;
  const goal=this.points[this.cursor].p;t.follow(goal,this.config.speed,'trail',.35);this.state=`${this.config.name}の実際に通った経路を追従 ${this.cursor+1}/${this.points.length}`;return true;
 }
 snapshot(){return {...this.config,config:{...this.config},waiting:this.state,state:this.state,points:this.points.length,cursor:this.cursor,lastSeen:this.lastSeen};}
 destroy(){this.bot.removeListener('actorAdded',this.onActor);this.bot.removeListener('actorUpdated',this.onActor);this.bot.removeListener('dimensionChanged',this.onDimension);}
}
module.exports={TrailFollower};
