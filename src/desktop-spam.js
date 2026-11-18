'use strict';
const {randomInt}=require('node:crypto');
const alphabet='abcdefghijklmnopqrstuvwxyz0123456789';
function format(s,text){if(!s.random)return text;const n=Math.max(1,Math.min(16,s.randomLength||6)),tag=Array.from({length:n},()=>alphabet[randomInt(alphabet.length)]).join('');return text+' ['+tag+']';}
function tick(runtime,now=Date.now()){
 const b=runtime.bot;if(!b?.connected||b.dead||b.ended||b.loggingOut)return;
 for(const [key,privateChat]of [['desktopSpam',false],['desktopTellSpam',true]]){
  const s=runtime.worker.state[key];if(!s?.enabled||!s.messages?.length)continue;
  if(privateChat&&b.lastChatDelivery?.type==='whisper'&&b.lastChatDelivery?.recipient===s.player&&b.lastChatDelivery.status==='rejected'){s.enabled=false;runtime.manager?.store?.save();runtime.lastSpamError=b.lastChatDelivery.error||'Tell rejected';continue;}
  const phase=(s.groupIndex||0)*(s.groupDelay??.5)*1000;if(now<(s.startedAt||0)+phase)continue;
  const nextKey=key+'Next',indexKey=key+'Index';if(now<(runtime[nextKey]||0))continue;
  if(privateChat&&now<(b.nextWhisperAt||0))continue;
  if(!privateChat&&b.chatQueue?.nextAt>now)continue;
  const i=runtime[indexKey]||0,text=format(s,s.messages[i%s.messages.length]);
  try{const msg=require('./chat-suffix').apply(runtime.worker.state,text,privateChat);const accepted=privateChat?(b.whisper(s.player,msg),true):b.chat(msg,false,{dedupeMs:0,key:'desktop-spam:'+runtime.worker.id,replace:true,tag:'desktop-spam'});if(accepted!==false)runtime[indexKey]=i+1;runtime[nextKey]=now+Math.max(5,Number(s.cycle??s.interval)||5)*1000;}
  catch(e){runtime[nextKey]=now+Math.max(5,Number(s.cycle??s.interval)||5)*1000;runtime.lastSpamError=String(e.message);}
 }
}
module.exports={tick,format};
