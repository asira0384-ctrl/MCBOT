'use strict';
// Pace public messages; never alter a rejected message to evade server filters.
class ChatQueue {
 constructor(bot,{now=Date.now,schedule=setTimeout,cancel=clearTimeout}={}){Object.assign(this,{bot,now,schedule,cancel});this.pending=[];this.nextAt=0;this.recent=new Map();this.timer=null;this.closed=false;}
 key(text){return text.replace(/\s*\|\s*[A-Za-z0-9]{10}$/u,'').normalize('NFKC');}
 enqueue(text,immediate=false,options={}){if(this.closed||!this.bot.connected||this.bot.ended)return false;const key=options.key||this.key(text),now=this.now(),dedupe=options.dedupeMs??30000;for(const[k,t]of this.recent)if(now-t>=30000)this.recent.delete(k);const pending=this.pending.find(m=>m.key===key);if(pending&&options.replace){Object.assign(pending,{text,...options,key});return true;}if(pending||now-(this.recent.get(key)??-Infinity)<dedupe)return false;
  // Logout must not wait for a queue, nor bypass a server cooldown.
  if(immediate){if(now<this.nextAt)return false;this.send({text,key,immediate});return true;}
  this.pending=this.pending.filter(m=>!m.expires||m.expires>=now);options={...options,createdAt:now,expires:now+(options.ttlMs??30000)};
  if(this.pending.length>=6){if(options.manual){const at=this.pending.findLastIndex(m=>!m.manual);if(at>=0)this.pending.splice(at,1);else return false;}else{this.bot.emit('diagnostic','チャット待機が6件に達したため古い自動通知を増やしません');return false;}}
  if(options.manual)options.priority=true;
  if(options.priority){const index=this.pending.findIndex(m=>!m.priority);this.pending.splice(index<0?this.pending.length:index,0,{text,...options,key});}else this.pending.push({text,...options,key});this.pump();return true;
 }
 send(m){if(!this.bot.connected||this.bot.ended)return;this.nextAt=this.now()+5000;this.recent.set(m.key,this.now());const packet=require('./chat-output').publicPacket(this.bot,m.render?m.render():m.text);if(m.immediate&&this.bot.client.write)this.bot.client.write('text',packet);else this.bot.client.queue('text',packet);require('./chat-delivery').sent(this.bot,'public',packet.message);if(m.manual)this.bot.client._tick?.();}
 pump(){this.pending=this.pending.filter(m=>!m.expires||m.expires>=this.now());if(this.closed||this.timer||!this.pending.length)return;const wait=this.nextAt-this.now();if(wait>0){this.timer=this.schedule(()=>{this.timer=null;this.pump();},wait);this.timer?.unref?.();return;}this.send(this.pending.shift());this.pump();}
 warning(packet){const warning=require('./chat-warning').warning(packet);if(!warning)return false;
  const at=this.now();if(this.bot.lastChatDelivery){this.bot.lastChatDelivery.status='rejected';this.bot.lastChatDelivery.error='サーバーのチャット制限: '+warning.message;this.bot.emit('chatDelivery');}this.nextAt=Math.max(this.nextAt,at+(warning.muted?60000:30000));this.bot.nextWhisperAt=Math.max(this.bot.nextWhisperAt||0,this.nextAt);if(this.timer)this.cancel(this.timer);this.timer=null;this.bot.emit('diagnostic','スパム・チャット制限を受信。送信を待機し、拒否された文は自動再送しません');
  if(at-(this.lastWarningAt??-Infinity)>=10000){this.lastWarningAt=at;this.bot.emit('chatLimited',{...warning,at,resumeAt:this.nextAt});}this.pump();return true;
 }
 clear(){const count=this.pending.length;this.pending=[];if(this.timer)this.cancel(this.timer);this.timer=null;return count;}
 snapshot(){return {pending:this.pending.length,waitMs:Math.max(0,this.nextAt-this.now()),maximum:6,warningAt:this.lastWarningAt||null};}
 close(){this.closed=true;if(this.timer)this.cancel(this.timer);this.timer=null;this.pending=[];}
}
module.exports={ChatQueue};
