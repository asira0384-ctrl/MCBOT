'use strict';
const {norm,solid}=require('./util'),{pass}=require('./navigation');
const TAU=2*Math.PI;
function configure(m,d){
 if(!['2b2e','ign'].includes(d.realm)||!['start','stop'].includes(d.action))throw Error('サーバーと操作を選んでください');
 if(d.action==='start'&&d.centerMode==='Coordinates'&&![d.x,d.y,d.z].every(n=>Number.isFinite(n)&&Math.abs(n)<=30000000))throw Error('中心座標を確認してください');
 const old=m.circles?.[d.realm];if(d.action==='start'&&((d.centerMode!=='Coordinates'&&!String(d.name||'').trim())||String(d.name).length>64||!Number.isFinite(d.radius)||d.radius<.5||d.radius>32))throw Error('MCIDと半径（0.5～32）を確認してください');
 for(const w of m.workers.values())if(old&&w.runtime?.circle===old){w.runtime.circle=null;w.runtime.travel.stopFollowing();if(d.action==='stop')w.runtime.stop();}
 m.circles??={};delete m.circles[d.realm];if(d.action==='start')m.circles[d.realm]={name:String(d.name||'').trim(),centerMode:d.centerMode||'Player',x:d.x,y:d.y,z:d.z,orbit:!!d.orbit,jump:d.jump===undefined?true:!!d.jump,speed:Math.max(.1,Math.min(2,Number(d.speed)||.5)),direction:d.direction==='Counterclockwise'?-1:1,radius:d.radius,excluded:new Set(),slots:new Map(),state:'位置を検出中',count:0,arrived:0,epoch:1};refresh(m,d.realm);return snapshot(m);
}
function snapshot(m){return Object.fromEntries(Object.entries(m.circles||{}).map(([k,c])=>[k,{name:c.name,centerMode:c.centerMode,x:c.x,y:c.y,z:c.z,orbit:c.orbit,jump:c.jump,speed:c.speed,direction:c.direction,radius:c.radius,count:c.count,arrived:c.arrived,state:c.state}]));}
function refresh(m,realm,now=Date.now()){
 const c=m.circles?.[realm];if(!c||now<(c.next||0))return;c.next=now+160;
 const all=[...m.workers.values()].filter(w=>m.realm(w.id)===realm&&w.bot.connected&&!w.bot.dead&&!w.bot.ended&&w.bot.entity?.position&&w.runtime);
 let center,dim,host,port,seen=-1;const match=n=>norm(n||'')===norm(c.name);
 if(c.centerMode==='Coordinates'&&all.length){const b=all[0].bot;center=b.entity.position.clone();Object.assign(center,{x:c.x,y:c.y,z:c.z});dim=b.dimensionId;host=b.config.host;port=b.config.port;seen=Infinity;}
 for(const w of (c.centerMode==='Coordinates'?[]:all)){const b=w.bot;const own=match(b.username);const a=own?{position:b.entity.position,dimension:b.dimensionId,seen:Infinity}:[...(b.actors?.values()||[])].filter(a=>a.player&&match(a.name)&&a.dimension===b.dimensionId).sort((a,b)=>b.seen-a.seen)[0];if(a&&(a.seen??0)>seen){seen=a.seen??0;center=a.position;dim=b.dimensionId;host=b.config.host;port=b.config.port;}}
 const team=center?all.filter(w=>!c.excluded.has(w.id)&&!match(w.bot.username)&&w.bot.dimensionId===dim&&w.bot.config.host===host&&w.bot.config.port===port):[];
 for(const w of m.workers.values())if(w.runtime?.circle===c&&!team.includes(w)){w.runtime.circle=null;w.runtime.travel.stopFollowing();}
 c.count=team.length;c.arrived=0;if(!center||!team.length){c.state=center?'参加Bot待ち':'対象の位置を受信するまで待機';c.signature=null;return;}
 const sig=[dim,host,port,...team.map(w=>w.id).sort((a,b)=>a-b)].join(':');
 if(sig!==c.signature){c.signature=sig;c.epoch++;const sorted=team.slice().sort((a,b)=>angle(a)-angle(b)||a.id-b.id);function angle(w){const p=w.bot.entity.position;return Math.atan2(p.z-center.z,p.x-center.x);}
 // Keep cyclic order and choose the rotation minimizing total squared travel.
 let x=0,z=0;sorted.forEach((w,i)=>{const p=w.bot.entity.position,t=i*TAU/team.length,dx=p.x-center.x,dz=p.z-center.z;x+=dx*Math.cos(t)+dz*Math.sin(t);z+=dz*Math.cos(t)-dx*Math.sin(t);});const rotation=Math.atan2(z,x);
 c.slots=new Map(sorted.map((w,i)=>[w.id,{angle:rotation+i*TAU/team.length}]));
 }
 if(!c.anchor||center.distanceTo(c.anchor)>.12){if(!c.moving)c.epoch++;c.moving=true;c.anchor=center.clone();c.movedAt=now;}else if(now-c.movedAt>=220)c.moving=false;
 c.center=center.clone();const radius=c.radius;
 for(const w of team){const r=w.runtime;if(r.circle!==c){w.stop();r.stop();r.paused=false;w.state.runtimePaused=false;r.circle=c;}
 const s=c.slots.get(w.id);if(c.orbit)s.angle+=Math.min(.25,Math.max(0,(now-(s.orbitAt||now))/1000))*c.speed*c.direction;s.orbitAt=now;const ideal=center.offset(radius*Math.cos(s.angle),0,radius*Math.sin(s.angle));s.goal=null;
 for(const delta of [0,.12,-.12,.26,-.26]){const spot=delta?center.offset(radius*Math.cos(s.angle+delta),0,radius*Math.sin(s.angle+delta)):ideal;for(const dy of (c.jump?[0,1,-1,2,-2,3,-3]:[0,-1,-2,-3])){const q=spot.floored().offset(0,dy,0);if(solid(w.bot.blockAt(q.offset(0,-1,0)))&&pass(w.bot,q)){s.goal=spot.offset(0,q.y-spot.y,0);break;}}if(s.goal)break;}
 if(!s.goal&&w.bot.entity.position.distanceTo(center)>radius+4)s.goal=ideal;
 if(s.goal&&w.bot.entity.position.distanceTo(s.goal)<.32)c.arrived++;
 }c.state=c.moving?'円のまま追従中':'整列 '+c.arrived+'/'+team.length;
}
function drive(r,now=Date.now()){const c=r.circle;if(!c)return false;const s=c.slots.get(r.worker.id),b=r.bot,p=b.entity.position,t=r.travel;if(!s?.goal){if(s){s.holding=false;s.rest=null;s.faceAt=null;}t.stopFollowing();return true;}
 if(!c.jump)b.setControlState('jump',false);
 const d=s.goal.minus(p),len=Math.hypot(d.x,d.z);const enter=Math.max(.10,Math.min(.24,c.radius*.15)),threshold=c.orbit?.035:(s.holding?enter+.25:enter);
 if(len<=threshold&&Math.abs(d.y)<.5){s.holding=true;t.stopFollowing();b.lookAt(c.center.offset(0,1.5,0),false);
 const v=b.entity.velocity;if(c.moving||b.entity.onGround===false||v&&Math.hypot(v.x,v.z)>.018||!s.rest||p.distanceTo(s.rest)>.018){s.rest=p.clone();s.restAt=now;s.faceAt=null;return true;}
 if(now-s.restAt<100)return true;b.lookAt(c.center.offset(0,1.5,0),false);s.faceAt??=now;
 if(now-s.faceAt>=50&&s.swung!==c.epoch&&!b.handUse&&!b.actionHandBusy){b.client.queue('animate',{action_id:'swing_arm',runtime_entity_id:BigInt(b._runtimeEntityId),data:0,has_swing_source:false});s.swung=c.epoch;}return true;}
 s.holding=false;s.rest=null;s.faceAt=null;
 if(len<1.4&&Math.abs(d.y)<.45&&[.33,.67,1].every(k=>{const q=p.offset(k*d.x,0,k*d.z).floored();return pass(b,q)&&solid(b.blockAt(q.offset(0,-1,0)));})){t.stopFollowing();b.desiredMoveWorld={x:d.x/len,z:d.z/len};b.desiredMoveSpeed=Math.min(.19,len);b.setControlState('forward',true);b.lookAt(s.goal.offset(0,1.5,0),false);}else if(!t.follow(s.goal,.21,'circle',.25)&&t.following&&now-(s.replanAt||0)>1000){t.following.plannedAt=0;s.replanAt=now;}if(c.jump&&c.orbit&&b.entity.onGround)b.setControlState('jump',true);else if(!c.jump)b.setControlState('jump',false);return true;
}
module.exports={configure,snapshot,refresh,drive};
