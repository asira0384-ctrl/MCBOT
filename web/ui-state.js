'use strict';
// Shared with the regression tests; drag operations are tied to one account
// and to the exact server snapshot from which the drag started.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.AsiraUI=api;})(globalThis,()=>({
 drag(bot,slot){const item=bot?.inventory?.[slot];return bot?.connected&&item?.name?{bot:String(bot.id),slot,token:item.token,count:item.count}:null;},
 validateDrag(drag,bot){return !!drag&&String(bot?.id)===drag.bot&&bot?.connected&&bot.inventory?.[drag.slot]?.token===drag.token;},
 pendingAlerts(bots,seen){const alerts=[];for(const bot of bots||[]){const job=bot.restock;if(job?.status==='pending'&&!seen.has(job.id)){seen.add(job.id);alerts.push({bot,job});}}return alerts;}
}));
