'use strict';
const {norm,clean}=require('./util');const {name,automatic}=require('./chat-output');const {randomInt}=require('node:crypto');
const pools={join:['Yo!','Inmu Kingがきたぞー！！','アイスティーはいかがですか？🫖'],leave:['Bye!','GoodBye! InmuKing👋🏻','またね！'],chat:['こんにちは！','聞こえてるで！','メッセージ届いてるで！']};
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function event(packet,target){if(!target)return null;const text=clean(packet.message||'');
 if(packet.type==='chat')return norm(packet.source_name)===norm(target)?'chat':null;
 if(!['raw','system','translation'].includes(packet.type)||packet.source_name)return null;
 const membership=text.match(/^\[([+-])\]\s+(.+)$/u);if(membership)return norm(membership[2])===norm(target)?membership[1]==='+'?'join':'leave':null;
 if(packet.type==='translation'&&(packet.parameters||[]).some(p=>norm(p)===norm(target))){if(text==='multiplayer.player.joined')return 'join';if(text==='multiplayer.player.left')return 'leave';}
 return new RegExp(`^${escape(target)}\\s*[➤»›>:]\\s*\\S`,'iu').test(text)?'chat':null;
}
class FleetGreetings{
 constructor(manager,{env=process.env,clock=Date.now,choose=randomInt}={}){this.manager=manager;this.target=env.GREET_TARGET_ID?.trim()?name(env.GREET_TARGET_ID):'';this.clock=clock;this.choose=choose;this.presence=new Map();this.lastSent=new Map();}
 handle(observer,packet){const w=this.manager.workers.get(observer),bot=w?.bot;if(!this.target||!bot?.connected||bot.ended||[...this.manager.names.values()].some(n=>norm(n)===norm(this.target)))return false;
  const kind=event(packet,this.target);if(!kind)return false;const realm=`${bot.config?.host||''}:${bot.config?.port||19132}`,target=realm+':'+norm(this.target),now=this.clock();
  if(kind!=='chat'){const online=kind==='join';if(this.presence.get(target)===online)return false;this.presence.set(target,online);}
  const key=target+':'+kind;const wait=kind==='chat'?60000:30000;if(now-(this.lastSent.get(key)??-Infinity)<wait)return false;
  const candidates=[...this.manager.workers.values()].filter(w=>w.bot.connected&&!w.bot.ended&&`${w.bot.config?.host||''}:${w.bot.config?.port||19132}`===realm);if(!candidates.length)return false;
  const selected=candidates[this.choose(candidates.length)],options=pools[kind];selected.bot.chat(automatic(options[this.choose(options.length)],this.target));this.lastSent.set(key,now);return true;
 }
 snapshot(){return {target:this.target,enabled:!!this.target,fleetDeduplicated:true,chatReplyIntervalSeconds:60};}
}
module.exports={FleetGreetings,event,pools};
