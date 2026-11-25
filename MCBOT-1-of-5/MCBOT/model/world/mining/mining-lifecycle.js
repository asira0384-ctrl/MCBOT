'use strict';
function world(bot){return {host:String(bot.config?.host||'').toLowerCase(),port:Number(bot.config?.port||19132),dimension:bot.dimensionId,level:String(bot.client?.startGameData?.level_id||bot.client?.startGameData?.world_name||'')};}
function enabled(worker){worker.state.nukeEnabled=true;worker.state.nukeWorld=world(worker.bot);worker.resumeOnConnect=false;}
function disable(state){state.nukeEnabled=false;}
function resume(worker){
 if(!worker.resumeOnConnect||!worker.state.nukeEnabled||worker.running||worker.startRequested)return false;
 const b=worker.bot,s=worker.state,current=world(b),previous=s.nukeWorld;
 if(!b.connected||b.ended||b.loggingOut||b.dead||!b.terrainReady||!Number.isFinite(b.health)||b.health<=0||b.pendingServerForm)return false;
 if(!previous||previous.host!==current.host||previous.port!==current.port||previous.dimension!==current.dimension||previous.level&&current.level&&previous.level!==current.level){worker.missing='採掘を再開せず待機: 前回と違う接続先・ワールドです';return false;}
 if(Date.now()<(worker.resumeRetryAt||0)||worker.busy||worker.controlBusy)return false;
 try{worker.start();worker.missing='再接続後に採掘を再開しました';worker.manager.changed?.(worker.id,'mining-resumed');return true;}
 catch(error){worker.resumeRetryAt=Date.now()+3000;worker.missing='採掘の再開待ち: '+error.message;return false;}
}
module.exports={world,enabled,disable,resume};
