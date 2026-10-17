'use strict';
const modes=new Set(['empty-health','pop','empty','health']);
function totalTotems(bot){return bot.list().filter(i=>/totem/.test(i.name)).reduce((n,i)=>n+i.count,0)+(/totem/.test(bot.name(bot.offhand?.[0]))?(bot.offhand[0].count||1):0);}
class AutoLog{
 constructor(runtime){this.runtime=runtime;this.bot=runtime.bot;this.hadTotem=totalTotems(this.bot)>0;this.fired=false;this.pop=()=>{if(runtime.config.autolog&&this.mode()==='pop')this.trigger('Totemの発動を検知');};this.bot.on('totemUsed',this.pop);}
 mode(){const c=this.runtime.config;return modes.has(c.logMode)?c.logMode:c.logOnlyEmptyTotem===false?'health':'empty-health';}
 async check(){if(this.promise){await this.promise;return true;}const r=this.runtime,b=this.bot,count=totalTotems(b);if(count>0)this.hadTotem=true;if(!r.config.autolog||b.dead||!b.connected||b.loggingOut)return false;
  const low=b.health!==null&&b.health>0&&b.health<=r.config.logHearts*2,mode=this.mode();
  if((mode==='health'&&low)||(mode==='empty-health'&&low&&count===0)||(mode==='empty'&&this.hadTotem&&count===0)){await this.trigger(mode==='empty'?'所持Totemが0個になりました':`体力${b.health/2}ハート`);return true;}return false;
 }
 trigger(reason){if(this.fired||this.bot.dead||!this.bot.connected)return this.promise||Promise.resolve();this.fired=true;const r=this.runtime,b=this.bot;r.combatAbort?.abort();r.consumeAbort?.abort();r.abort?.abort();r.travel.cancel(false);r.safety.cancel();r.worker.stop();r.notice('AutoLog: '+reason+'で切断します',false);r.manager.watchReentry?.(r.worker.id,b,r.target);
  this.promise=b.logout('あぶねぇwあぶねぇw死にかけたぜw').catch(e=>{r.notice('AutoLog: '+e.message,false);b.disconnect();});return this.promise;
 }
 reset(){if(!this.bot.loggingOut){this.fired=false;this.promise=null;}}
 snapshot(){return {mode:this.mode(),totems:totalTotems(this.bot),hadTotem:this.hadTotem,triggered:this.fired};}
 destroy(){this.bot.removeListener('totemUsed',this.pop);}
}
module.exports={AutoLog,totalTotems,modes};
