'use strict';
const {clean,norm}=require('../shared/util');
function append(worker,kind,reason,actor=null,evidence=null){
 const rows=worker.state.killLog??=[];
 const event={at:new Date().toISOString(),kind,reason,actor,evidence};
 rows.push(event);
 if(rows.length>100)rows.shift();
 worker.manager.store.save();
 return event;
}
function message(worker,packet){
 if(packet.source_name||packet.type!=='translation')return;
 const key=String(packet.message).replace(/^%/,'');
 const [victim,killer]=packet.parameters||[];
 if(!key.startsWith('death.')||!victim||norm(victim)!==norm(worker.bot.username))return;
 const info={reason:key,actor:killer?clean(killer).slice(0,80):null,evidence:'server death message'};
 worker.deathMessage={...info,at:Date.now()};
 const last=worker.state.killLog?.at(-1);
 if(last?.kind==='Death'&&Date.now()-Date.parse(last.at)<5000){
  Object.assign(last,info);worker.manager.store.save();worker.deathMessage=null;
 }
}
function death(worker){
 const details=worker.deathMessage;worker.deathMessage=null;
 if(details&&Date.now()-details.at<5000)append(worker,'Death',details.reason,details.actor,details.evidence);
 else append(worker,'Death',worker.bot.lastDeathSignal||'死亡');
}
function autoLog(worker,reason,actor,engagedAt){
 const candidate=actor?.player&&actor.name&&Date.now()-engagedAt<5000?actor.name:null;
 append(worker,'AutoLog',reason,candidate,candidate?'recent PvP target (unconfirmed)':null);
}
module.exports={message,death,autoLog};
