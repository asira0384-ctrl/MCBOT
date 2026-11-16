'use strict';
const {norm,solid}=require('./util'),{pass}=require('./navigation');
const TAU=2*Math.PI;
function configure(m,d){
 if(!['2b2e','ign'].includes(d.realm)||!['start','stop'].includes(d.action))throw Error('サーバーと操作を選んでください');
 const old=m.circles?.[d.realm];if(d.action==='start'&&(!String(d.name||'').trim()||String(d.name).length>64||!Number.isFinite(d.radius)||d.radius<2||d.radius>32))throw Error('MCIDと半径（2～32）を確認してください');
 for(const w of m.workers.values())if(old&&w.runtime?.circle===old){w.runtime.circle=null;w.runtime.travel.stopFollowing();}
 m.circles??={};delete m.circles[d.realm];if(d.action==='start')m.circles[d.realm]={name:d.name.trim(),radius:d.radius,slots:new Map(),state:'位置を検出中',count:0,arrived:0,epoch:1};refresh(m,d.realm);return snapshot(m);
}
function snapshot(m){return Object.fromEntries(Object.entries(m.circles||{}).map(([k,c])=>[k,{name:c.name,radius:c.radius,count:c.count,arrived:c.arrived,state:c.state}]));}
function refresh(m,realm,now=Date.now()){
 const c=m.circles?.[realm];if(!c||now<(c.next||0))return;c.next=now+160;
 const all=[...m.workers.values()].filter(w=>m.realm(w.id)===realm&&w.bot.connected&&!w.bot.dead&&!w.bot.ended&&w.bot.entity?.position&&w.runtime);
 let center,dim,host,port,seen=-1;const match=n=>norm(n||'')===norm(c.name);
 for(const w of all){const b=w.bot;const own=match(b.username);const a=own?{position:b.entity.position,dimension:b.dimensionId,seen:Infinity}:[...(b.actors?.values()||[])].filter(a=>a.player&&match(a.name)&&a.dimension===b.dimensionId).sort((a,b)=>b.seen-a.seen)[0];if(a&&(a.seen??0)>seen){seen=a.seen??0;center=a.position;dim=b.dimensionId;host=b.config.host;port=b.config.port;}}
 const team=center?all.filter(w=>!match(w.bot.username)&&w.bot.dimensionId===dim&&w.bot.config.host===host&&w.bot.config.port===port):[];
 for(const w of m.workers.values())if(w.runtime?.circle===c&&!team.includes(w)){w.runtime.circle=null;w.runtime.travel.stopFollowing();}
 c.count=team.length;c.arrived=0;if(!center||!team.length){c.state=center?'参加Bot待ち':'対象の位置を受信するまで待機';c.signature=null;return;}
 const sig=[dim,host,port,...team.map(w=>w.id).sort((a,b)=>a-b)].join(':');
 if(sig!==c.signature){c.signature=sig;c.epoch++;const sorted=team.slice().sort((a,b)=>angle(a)-angle(b)||a.id-b.id);function angle(w){const p=w.bot.entity.position;return Math.atan2(p.z-center.z,p.x-center.x);}
 // Keep cyclic order and choose the rotation minimizing total squared travel.
 let x=0,z=0;sorted.forEach((w,i)=>{const p=w.bot.entity.position,t=i*TAU/team.length,dx=p.x-center.x,dz=p.z-center.z;x+=dx*Math.cos(t)+dz*Math.sin(t);z+=dz*Math.cos(t)-dx*Math.sin(t);});const rotation=Math.atan2(z,x);
 c.slots=new Map(sorted.map((w,i)=>[w.id,{angle:rotation+i*TAU/team.length}]));
 }
 if(!c.anchor||center.distanceTo(c.anchor)>.12){if(!c.moving)c.epoch++;c.moving=true;c.anchor=center.clone();c.movedAt=now;}else if(now-c.movedAt>=650)c.moving=false;
 c.center=center.clone();const radius=Math.max(c.radius,team.length/Math.PI);
 for(const w of team){const r=w.runtime;if(r.circle!==c){w.stop();r.stop();r.paused=false;w.state.runtimePaused=false;r.circle=c;}
 const s=c.slots.get(w.id),ideal=center.offset(radius*Math.cos(s.angle),0,radius*Math.sin(s.angle));s.goal=null;
 for(const dy of [0,1,-1,2,-2]){const q=ideal.floored().offset(0,dy,0);if(solid(w.bot.blockAt(q.offset(0,-1,0)))&&pass(w.bot,q)){s.goal=ideal.offset(0,q.y-ideal.y,0);break;}}
 if(s.goal&&w.bot.entity.position.distanceTo(s.goal)<.32)c.arrived++;
 }c.state=c.moving?'円のまま追従中':'整列 '+c.arrived+'/'+team.length;
}
function drive(r){const c=r.circle;if(!c)return false;const s=c.slots.get(r.worker.id),b=r.bot,p=b.entity.position,t=r.travel;if(!s?.goal){t.stopFollowing();return true;}
 const d=s.goal.minus(p),len=Math.hypot(d.x,d.z);if(len<=.25&&Math.abs(d.y)<.5){t.stopFollowing();b.lookAt(c.center.offset(0,1.5,0),false);if(!c.moving&&s.swung!==c.epoch&&!b.handUse&&!b.actionHandBusy){b.client.queue('animate',{action_id:'swing_arm',runtime_entity_id:BigInt(b._runtimeEntityId),data:0,has_swing_source:false});s.swung=c.epoch;}return true;}
 if(len<1.4&&Math.abs(d.y)<.45&&[.33,.67,1].every(k=>{const q=p.offset(k*d.x,0,k*d.z).floored();return pass(b,q)&&solid(b.blockAt(q.offset(0,-1,0)));})){t.stopFollowing();b.desiredMoveWorld={x:d.x/len,z:d.z/len};b.desiredMoveSpeed=Math.min(.19,len);b.setControlState('forward',true);b.lookAt(s.goal.offset(0,1.5,0),false);}else t.follow(s.goal,.21,'circle',.25);return true;
}
module.exports={configure,snapshot,refresh,drive};
