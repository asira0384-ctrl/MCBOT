'use strict';
function world(bot){return {host:String(bot.config?.host||'').toLowerCase(),port:Number(bot.config?.port||19132),dimension:bot.dimensionId,level:String(bot.client?.startGameData?.level_id||bot.client?.startGameData?.world_name||'')};}
function enabled(worker){worker.state.nukeEnabled=true;delete worker.state.nukePending;worker.state.nukeWorld=world(worker.bot);worker.resumeOnConnect=false;}
function disable(state){state.nukeEnabled=false;delete state.nukePending;}
function resume(worker){
 if(!worker.resumeOnConnect||!worker.state.nukeEnabled||worker.running||worker.startRequested)return false;
 const b=worker.bot,s=worker.state,current=world(b);
 if(!b.connected||b.ended||b.loggingOut||b.dead||!b.terrainReady||!Number.isFinite(b.health)||b.health<=0||b.pendingServerForm)return false;
 const accepted=s.nukeWorld||(s.nukePending?current:null);
 if(!accepted||accepted.host!==current.host||accepted.port!==current.port||accepted.dimension!==current.dimension||accepted.level&&current.level&&accepted.level!==current.level){worker.missing='採掘を再開せず待機: 前回と違う接続先・ワールドです';return false;}
 if(Date.now()<(worker.resumeRetryAt||0)||worker.busy||worker.controlBusy)return false;
 try{worker.start();worker.missing='再接続後に採掘を再開しました';worker.manager.changed?.(worker.id,'mining-resumed');return true;}
 catch(error){worker.resumeRetryAt=Date.now()+3000;worker.missing='採掘の再開待ち: '+error.message;return false;}
}
module.exports={world,enabled,disable,resume};
