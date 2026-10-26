'use strict';
class UrgentTotem{
 constructor(runtime){this.runtime=runtime;this.bot=runtime.bot;this.state={phase:'idle'};this.onChange=()=>this.request();for(const event of ['totemUsed','inventorySnapshot','spawn'])this.bot.on(event,this.onChange);}
 request(){const r=this.runtime,b=this.bot;if(this.task||r.destroyed||!b.connected||b.dead||!r.config.autototem||b.manualInventoryBusy||/totem/.test(b.name(b.offhand?.[0]))||!(b.find('totem_of_undying')||b.find('totem'))||Date.now()<(this.retryAt||0))return this.task;
  this.state={phase:'requested',requestedAt:Date.now()};b.urgentOffhandPending=true;r.consumeAbort?.abort();r.combatAbort?.abort();if(r.worker.running){r.resumeMining=true;r.worker.stop();}this.controller=new AbortController();
  this.task=Promise.resolve().then(async()=>{await b.equipmentTail?.catch(()=>{});if(b.handUse||b.actionHandBusy)await b.waitUntil(()=>!b.handUse&&!b.actionHandBusy,1000,this.controller.signal);if(b.dead||!b.connected||!r.config.autototem)return;await b.openInventory(this.controller.signal);const item=b.find('totem_of_undying')||b.find('totem');if(!item||/totem/.test(b.name(b.offhand?.[0])))return;this.state.phase='sent';this.state.sentAt=Date.now();await b.swapContainer('hotbar_and_inventory',item.slot,'offhand',0,this.controller.signal);this.state.phase='confirmed';this.state.confirmedAt=Date.now();this.state.durationMs=this.state.confirmedAt-this.state.requestedAt;}).catch(error=>{this.state.phase='retry';this.state.error=error.message;r.featureErrors??={};r.featureErrors['オフハンド装着']={message:error.message,at:Date.now(),retryAt:Date.now()+500};this.retryAt=Date.now()+500;}).finally(()=>{b.urgentOffhandPending=false;this.task=null;if(!b.manualInventoryBusy&&!b.pendingStackRequest)try{b.closeContainer();}catch{}b.emit('handAvailable');});return this.task;
 }
 destroy(){this.controller?.abort();for(const event of ['totemUsed','inventorySnapshot','spawn'])this.bot.removeListener(event,this.onChange);}
}
module.exports={UrgentTotem};
