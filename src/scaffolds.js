'use strict';
const {Vec3}=require('vec3'),{air,solid,key}=require('./util');
function rows(worker){return Object.values(worker.state.owned||{}).filter(o=>o.kind==='scaffold'&&o.dimension===worker.bot.dimensionId);}
function occupied(worker,q){if(worker.underPlayer(q))return true;return [...(worker.bot.actors?.values()||[])].some(a=>a.player&&(a.dimension===undefined||a.dimension===worker.bot.dimensionId)&&Math.abs(a.position.x-q.x-.5)<.85&&Math.abs(a.position.z-q.z-.5)<.85&&a.position.y>=q.y&&a.position.y<q.y+2.1);}
function usedByPath(worker,q){return [...worker.manager.workers.values()].some(w=>{if(w.bot.dimensionId!==worker.bot.dimensionId)return false;const t=w.runtime?.travel;return [t?.walking?.goal,...(t?.following?.path||[]).map(n=>n.position),...(t?.groundPlan?.path||[]).map(n=>n.position)].filter(Boolean).some(p=>Math.floor(p.x)===q.x&&Math.floor(p.z)===q.z&&Math.floor(p.y)-1===q.y);});}
function leaves(worker){const all=rows(worker),supports=Object.values(worker.state.owned||{}).filter(o=>o.dimension===worker.bot.dimensionId);return all.filter(o=>!supports.some(other=>other!==o&&other.p.x===o.p.x&&other.p.z===o.p.z&&other.p.y>o.p.y)).sort((a,b)=>b.p.y-a.p.y);}
function permanent(worker,point){const floor=point.offset(0,-1,0);return solid(worker.bot.blockAt(floor))&&!worker.owned(floor);}
async function step(worker,signal,{finish=false}={}){
 const b=worker.bot,travel=worker.runtime?.travel,now=Date.now();worker.scaffoldFailures??=new Map();
 for(const o of rows(worker)){const q=new Vec3(o.p.x,o.p.y,o.p.z),block=b.blockAt(q);if(block&&(air(block)||block.name!==o.name))worker.removeOwned(q);}
 let all=rows(worker);const result=(phase,reason,progress=false)=>{const value={phase,remaining:rows(worker).length,reason,progress,at:Date.now()};worker.scaffoldCleanup=value;return value;};
 if(!all.length){worker.state.scaffoldCleanupPending=false;return result('complete','置いた足場の回収完了');}
 if(b.handUse||b.actionHandBusy||b.manualInventoryBusy||travel?.flight||worker.runtime?.protectAnti?.())return result('waiting','飲食・手の操作・飛行・戦闘が終わってから足場を回収します');
 const available=leaves(worker).filter(o=>{const p=new Vec3(o.p.x,o.p.y,o.p.z),owner=worker.manager.claims?.get(`${b.dimensionId}:${key(p)}`);return !(worker.running&&worker.miner?.layer>p.y&&worker.miner?.layer-p.y<=6)&&!occupied(worker,p)&&!usedByPath(worker,p)&&(owner===undefined||owner===worker.id)&&(worker.scaffoldFailures.get(key(p))||0)<=now;});
 const target=available.find(o=>{const block=b.blockAt(new Vec3(o.p.x,o.p.y,o.p.z));return block?.name===o.name&&b.reach(block)&&b.visible(block);});
 if(target){const q=new Vec3(target.p.x,target.p.y,target.p.z),claim=`${b.dimensionId}:${key(q)}`;worker.manager.claims??=new Map();worker.manager.claims.set(claim,worker.id);
  try{worker.miningPhase='cleanup';await b.dig(b.blockAt(q),signal);worker.removeOwned(q);return result('removing','不要になった自分の足場を回収中',true);}catch(e){if(signal?.aborted)throw e;worker.scaffoldFailures.set(key(q),now+3000);return result('retry','足場の回収を再確認: '+e.message);}finally{worker.manager.claims.delete(claim);}
 }
 if(!finish||!travel)return result('waiting','足元・他プレイヤー・上の足場を支えている足場は移動後に回収します');
 // Move onto received permanent ground before removing our last support.
 const base=b.entity.position.floored(),goals=[];for(let dx=-5;dx<=5;dx++)for(let dz=-5;dz<=5;dz++)for(let dy=-3;dy<=1;dy++){
  const q=base.offset(dx,dy,dz),point=q.offset(.5,0,.5);if(point.distanceTo(b.entity.position)<.5||!permanent(worker,point)||!require('./navigation').pass(b,q))continue;
  const nextTarget=available[0]||all[0],tp=new Vec3(nextTarget.p.x,nextTarget.p.y,nextTarget.p.z);goals.push({point,score:point.distanceTo(b.entity.position)+point.distanceTo(tp)*.6});
 }
 goals.sort((a,c)=>a.score-c.score);for(const {point}of goals.slice(0,12)){
  const path=require('./navigation').groundPath(b,b.entity.position,point,{limit:350,blocked:(a,c)=>travel.edgeBlocked?.(a,c)});if(!path.length||path.at(-1).position.offset(.5,0,.5).distanceTo(point)>.25)continue;
  try{await travel.walk(point,'walk',signal,{allowScaffold:false});return result('approach','安全な地面へ移動して足場を回収中',true);}catch(e){if(signal?.aborted)throw e;}
 }
 const unknown=all.find(o=>!b.blockAt(new Vec3(o.p.x,o.p.y,o.p.z)));if(unknown)b.worldMirror?.request(unknown.p.x>>4,unknown.p.z>>4,unknown.p.y>>4,unknown.p.y>>4);
 return result('waiting',unknown?'残った足場の地形受信待ち':'足場の近くの安全な地面へ移動してください。足元や他人の支えは壊しません');
}
module.exports={step,rows,occupied,leaves};
