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
 constructor(manager,{env=process.env,clock=Date.now,choose=randomInt}={}){this.manager=manager;this.target=env.GREET_TARGET_ID?.trim()?name(env.GREET_TARGET_ID):'';this.clock=clock;this.choose=choose;this.presence=new Map();this.lastSent=new Map();this.lastEvent=null;}
 status(){return this.target?`グリーター: ON / 対象ID: ${this.target}\n送信形式: @${this.target} | 挨拶 | ランダム10文字\n公開チャットへの返事は60秒間隔、同じ通知は1体だけ送信します。`:'グリーター: OFF / 対象IDが未設定です。Railway Variablesに GREET_TARGET_ID=Asira などを設定し、再デプロイしてください。';}
 test(id){if(!this.target)throw Error(this.status());const bot=this.manager.workers.get(id)?.bot;if(!bot?.connected||bot.ended||bot.loggingOut)throw Error(`Bot${id}は未接続です`);const text=automatic('Yo!',this.target);if(bot.chat(text)===false)throw Error('公開チャットを送信できませんでした');this.record(id,'test',text);return `テスト挨拶を送信キューへ追加しました: ${text}`;}
 record(id,kind,text){this.lastEvent={kind,target:this.target,sender:id,text,at:new Date(this.clock()).toISOString()};this.manager.trace?.(id,`グリーター ${kind}: ${text}（送信キューへ追加）`);}
 handle(observer,packet){const w=this.manager.workers.get(observer),bot=w?.bot;if(!this.target||!bot?.connected||bot.ended||bot.loggingOut||[...this.manager.names.values()].some(n=>norm(n)===norm(this.target)))return false;
  const kind=event(packet,this.target);if(!kind)return false;const realm=`${bot.config?.host||''}:${bot.config?.port||19132}`,target=realm+':'+norm(this.target),now=this.clock();
  if(kind!=='chat'){const online=kind==='join';if(this.presence.get(target)===online)return false;this.presence.set(target,online);}
  const key=target+':'+kind;const wait=kind==='chat'?60000:30000;if(now-(this.lastSent.get(key)??-Infinity)<wait)return false;
  const candidates=[...this.manager.workers.entries()].filter(([,w])=>w.bot.connected&&!w.bot.ended&&!w.bot.loggingOut&&`${w.bot.config?.host||''}:${w.bot.config?.port||19132}`===realm);if(!candidates.length)return false;
  const [sender,selected]=candidates[this.choose(candidates.length)],options=pools[kind],text=automatic(options[this.choose(options.length)],this.target);if(selected.bot.chat(text)===false){if(kind!=='chat')this.presence.delete(target);return false;}this.lastSent.set(key,now);this.record(sender,kind,text);return true;
 }
 snapshot(){return {target:this.target,enabled:!!this.target,fleetDeduplicated:true,chatReplyIntervalSeconds:60,lastEvent:this.lastEvent};}
}
module.exports={FleetGreetings,event,pools};
