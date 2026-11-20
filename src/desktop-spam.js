'use strict';
// Desktop Spam/TellSpam intentionally do not use the manual ChatQueue.
// Server mute/filter feedback is still respected: a client cannot override it.
const {randomInt}=require('node:crypto');
const alphabet='abcdefghijklmnopqrstuvwxyz0123456789';
function format(s,text){
 if(!s.random)return text;
 const n=Math.max(1,Math.min(16,Number(s.randomLength)||6));
 const tag=Array.from({length:n},()=>alphabet[randomInt(alphabet.length)]).join('');
 return text+' ['+tag+']';
}
function deliveryBlocked(bot,now){
 const q=bot.chatQueue;
 // Only a SERVER warning blocks spam; pending local chat messages never do.
 return !!(q?.lastWarningAt&&now-q.lastWarningAt<120000&&now<q.nextAt);
}
function sendPublic(bot,text){
 const packet=require('./chat-output').publicPacket(bot,text);
 if(!bot.client?.queue)throw Error('Minecraft client transport not ready');
 bot.client.queue('text',packet);
 bot.client._tick?.();
 require('./chat-delivery').sent(bot,'public',packet.message);
 return true;
}
function sendTell(bot,recipient,text){
 const packet=require('./chat-output').whisperPacket(bot,recipient,text);
 if(!bot.client?.queue)throw Error('Minecraft client transport not ready');
 // The separate desktop tell scheduler controls pacing. Do not use the 5s
 // public ChatQueue delay or the manual /tell command's local timer.
 bot.client.queue('command_request',packet);
 bot.client._tick?.();
 require('./chat-delivery').sent(bot,'whisper',text,recipient,packet.origin?.request_id);
 return true;
}
function tick(runtime,now=Date.now()){
 const bot=runtime.bot;
 if(!bot?.connected||bot.dead||bot.ended||bot.loggingOut)return;
 if(deliveryBlocked(bot,now))return;
 for(const [key,privateChat] of [['desktopSpam',false],['desktopTellSpam',true]]){
  const settings=runtime.worker.state[key];
  if(!settings?.enabled||!settings.messages?.length)continue;
  if(privateChat&&bot.lastChatDelivery?.type==='whisper'&&
    bot.lastChatDelivery.recipient===settings.player&&
    bot.lastChatDelivery.status==='rejected'){
   settings.enabled=false;
   runtime.lastSpamError=bot.lastChatDelivery.error||'Tell rejected';
   runtime.manager?.store?.save();
   continue;
  }
  const groupOffset=(settings.groupIndex||0)*(settings.groupDelay??.5)*1000;
  if(now<(settings.startedAt||0)+groupOffset)continue;
  const nextKey=key+'Next',indexKey=key+'Index';
  if(now<(runtime[nextKey]||0))continue;
  const i=runtime[indexKey]||0;
  const text=format(settings,settings.messages[i%settings.messages.length]);
  // A bot's public and private spam schedules are independent.
  const interval=Math.max(1,Number(settings.cycle||settings.interval)||5)*1000;
  try{
   const message=require('./chat-suffix').apply(runtime.worker.state,text,privateChat);
   if(privateChat){
    if(!settings.player)throw Error('TellSpam requires a recipient');
    sendTell(bot,settings.player,message);
   }else sendPublic(bot,message);
   runtime[indexKey]=i+1;
   runtime.lastSpamError='';
  }catch(error){runtime.lastSpamError=String(error.message||error);}
  runtime[nextKey]=now+interval;
 }
}
module.exports={tick,format,sendPublic,sendTell,deliveryBlocked};
