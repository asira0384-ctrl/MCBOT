'use strict';
// Pace public messages; never alter a rejected message to evade server filters.
class ChatQueue {
 constructor(bot,{now=Date.now,schedule=setTimeout,cancel=clearTimeout}={}){Object.assign(this,{bot,now,schedule,cancel});this.pending=[];this.nextAt=0;this.recent=new Map();this.timer=null;this.closed=false;}
 key(text){return text.replace(/\s*\|\s*[A-Za-z0-9]{10}$/u,'').normalize('NFKC');}
 enqueue(text,immediate=false,options={}){if(this.closed||!this.bot.connected||this.bot.ended)return false;const key=options.key||this.key(text),now=this.now(),dedupe=options.dedupeMs??30000;for(const[k,t]of this.recent)if(now-t>=30000)this.recent.delete(k);const pending=this.pending.find(m=>m.key===key);if(pending&&options.replace){Object.assign(pending,{text,...options,key});return true;}if(pending||now-(this.recent.get(key)??-Infinity)<dedupe)return false;
  // Logout must not wait for a queue, nor bypass a server cooldown.
  if(immediate){if(now<this.nextAt)return false;this.send({text,key,immediate});return true;}
  if(this.pending.length>=20){this.bot.emit('diagnostic','チャット待機が20件に達したため追加を省略しました');return false;}
  if(options.priority){const index=this.pending.findIndex(m=>!m.priority);this.pending.splice(index<0?this.pending.length:index,0,{text,...options,key});}else this.pending.push({text,...options,key});this.pump();return true;
 }
 send(m){if(!this.bot.connected||this.bot.ended)return;this.nextAt=this.now()+5000;this.recent.set(m.key,this.now());const packet=require('./chat-output').publicPacket(this.bot,m.render?m.render():m.text);if(m.immediate&&this.bot.client.write)this.bot.client.write('text',packet);else this.bot.client.queue('text',packet);}
 pump(){if(this.closed||this.timer||!this.pending.length)return;const wait=this.nextAt-this.now();if(wait>0){this.timer=this.schedule(()=>{this.timer=null;this.pump();},wait);this.timer?.unref?.();return;}this.send(this.pending.shift());this.pump();}
 warning(packet){if(!['raw','system','translation','tip','popup'].includes(packet.type)||packet.source_name)return false;const text=String(packet.message||'').replace(/§./gu,'').trim();if(!/^(?:[»›❯>]\s*)?(?:Refrain from spamming!|Please (?:do not|don't) spam[.!]?|You are sending messages too (?:fast|quickly)[.!]?)$/iu.test(text))return false;
  this.nextAt=Math.max(this.nextAt,this.now()+30000);if(this.timer)this.cancel(this.timer);this.timer=null;this.bot.emit('diagnostic','スパム警告を受信: 公開チャットを30秒待機します。拒否された文は自動再送しません');this.pump();return true;
 }
 close(){this.closed=true;if(this.timer)this.cancel(this.timer);this.timer=null;this.pending=[];}
}
module.exports={ChatQueue};
