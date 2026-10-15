'use strict';
const {norm}=require('./util');const {clean,textOf,publicChat}=require('./chat-input');const {name,automatic}=require('./chat-output');const {randomInt}=require('node:crypto');
const pools={join:['Yo!','Inmu Kingがきたぞー！！','アイスティーはいかがですか？🫖'],leave:['Bye!','GoodBye! InmuKing👋🏻','またね！'],chat:['こんにちは！','聞こえてるで！','メッセージ届いてるで！']};
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function event(packet,target){if(!target||packet.type==='whisper')return null;const text=textOf(packet),chat=publicChat(packet);if(chat&&norm(chat.name)===norm(target)&&!chat.message.startsWith('!'))return 'chat';
 if(packet.type==='chat')return norm(packet.source_name)===norm(target)?'chat':null;
 if(!['raw','system','translation'].includes(packet.type))return null;
 const membership=text.match(/^\[([+-])\]\s+(.+)$/u);if(membership)return norm(membership[2])===norm(target)?membership[1]==='+'?'join':'leave':null;
 const ign=text.match(/^(?:<:[A-Za-z0-9_]+:\d+>\s*)?`?(.+?) (decided to join us for some PvP\.|had enough PvP for now\.)`?$/u);if(ign)return norm(ign[1])===norm(target)?ign[2].startsWith('decided')?'join':'leave':null;
 if(packet.type==='translation'&&(packet.parameters||[]).some(p=>norm(p)===norm(target))){if(text==='multiplayer.player.joined')return 'join';if(text==='multiplayer.player.left')return 'leave';}
 return new RegExp(`^${escape(target)}\\s*[➤»›>:]\\s*\\S`,'iu').test(text)?'chat':null;
}
class FleetGreetings{
 constructor(manager,{env=process.env,clock=Date.now,choose=randomInt}={}){this.manager=manager;this.target=env.GREET_TARGET_ID?.trim()?name(env.GREET_TARGET_ID):'';this.clock=clock;this.choose=choose;this.presence=new Map();this.lastSent=new Map();this.lastEvent=null;}
 targetFor(bot){return bot.config?.greetTarget??this.target;}
 status(target=this.target){return target?`グリーター: ON / 対象ID: ${target}\n送信形式: @${target} | 挨拶 | ランダム10文字\n公開チャットへの返事は60秒間隔、同じ通知は1体だけ送信します。`:'グリーター: OFF / 対象IDが未設定です。Railway Variablesに GREET_TARGET_ID=Asira などを設定し、再デプロイしてください。';}
 test(id){const bot=this.manager.workers.get(id)?.bot;if(!bot?.connected||bot.ended||bot.loggingOut)throw Error(`Bot${id}は未接続です`);const target=this.targetFor(bot);if(!target)throw Error(this.status(target));const text=automatic('Yo!',target);if(bot.chat(text)===false)throw Error('公開チャットを送信できませんでした');this.record(id,'test',text,target);return `テスト挨拶を送信キューへ追加しました: ${text}`;}
 record(id,kind,text,target=this.target){this.lastEvent={kind,target,sender:id,text,at:new Date(this.clock()).toISOString()};this.manager.trace?.(id,`グリーター ${kind}: ${text}（送信キューへ追加）`);}
 handle(observer,packet){const w=this.manager.workers.get(observer),bot=w?.bot,watched=bot&&this.targetFor(bot);if(!watched||!bot?.connected||bot.ended||bot.loggingOut||[...this.manager.names.values()].some(n=>norm(n)===norm(watched)))return false;
  const kind=event(packet,watched);if(!kind)return false;const realm=`${bot.config?.host||''}:${bot.config?.port||19132}`,target=realm+':'+norm(watched),now=this.clock();
  if(kind!=='chat'){const previous=this.presence.get(target);if(previous?.kind===kind&&now-previous.at<2500)return false;}
  const key=target+':'+kind;const wait=kind==='chat'?60000:5000;if(now-(this.lastSent.get(key)??-Infinity)<wait)return false;
  const candidates=[...this.manager.workers.entries()].filter(([,w])=>w.bot.connected&&!w.bot.ended&&!w.bot.loggingOut&&!w.bot.dead&&(w.id===observer||this.manager.workers.get(observer)===w||w.bot.terrainEstablished)&&`${w.bot.config?.host||''}:${w.bot.config?.port||19132}`===realm);if(!candidates.length)return false;
  const [sender,selected]=candidates[this.choose(candidates.length)],options=pools[kind],text=automatic(options[this.choose(options.length)],watched);if(selected.bot.chat(text)===false)return false;this.lastSent.set(key,now);if(kind!=='chat')this.presence.set(target,{kind,at:now});this.record(sender,kind,text,watched);return true;
 }
 snapshot(){return {target:this.target,enabled:!!this.target,fleetDeduplicated:true,chatReplyIntervalSeconds:60,lastEvent:this.lastEvent};}
}
module.exports={FleetGreetings,event,pools};
