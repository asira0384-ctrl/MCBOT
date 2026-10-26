'use strict';
const {norm}=require('./util');const {textOf,publicChat}=require('./chat-input');const {name,automatic}=require('./chat-output');const {randomInt}=require('node:crypto');const settings=require('./messaging');
const pools={
 join:['Yo!','こんにちは！','ようこそ！','おかえり！','会えてうれしいで！','今日もよろしく！','やっほー！','いらっしゃい！','Hello!','Welcome back!','Hey, good to see you!','Have a good game!','お疲れさま！','準備はできてる？','楽しんでいこう！','今日も元気そうやな！','待ってたで！','Good luck today!','Hi there!','また会えたな！'],
 leave:['またね！','お疲れさま！','また遊ぼう！','気をつけてな！','おやすみ！','次もよろしく！','See you!','Bye!','Take care!','Good game!','See you next time!','また会おう！','今日はありがとう！','Have a good one!','また来てな！','Catch you later!'],
 chat:['こんにちは！','聞こえてるで！','メッセージ届いてるで！','今日もよろしく！','Hello!','Hey there!','楽しんでる？','調子どう？','お疲れさま！','やっほー！','Good luck!','Nice to see you!','元気そうやな！','Have fun!','ぼちぼちやってるで！','今日もいいゲームを！','こっちも作業中やで！','Sounds good!','また一緒に遊ぼう！','Cheers!']
};
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function event(packet,target){if(!target||packet.type==='whisper')return null;const text=textOf(packet),chat=publicChat(packet);if(chat&&norm(chat.name)===norm(target)&&!chat.message.startsWith('!'))return 'chat';if(packet.type==='chat')return norm(packet.source_name)===norm(target)?'chat':null;if(!['raw','system','translation'].includes(packet.type))return null;
 const membership=text.match(/^\[([+-])\]\s+(.+)$/u);if(membership)return norm(membership[2])===norm(target)?membership[1]==='+'?'join':'leave':null;
 const ign=text.match(/^(?:<:[A-Za-z0-9_]+:\d+>\s*)?`?(.+?) (decided to join us for some PvP\.|had enough PvP for now\.)`?$/u);if(ign)return norm(ign[1])===norm(target)?ign[2].startsWith('decided')?'join':'leave':null;
 if(packet.type==='translation'&&(packet.parameters||[]).some(p=>norm(p)===norm(target))){if(text==='multiplayer.player.joined')return 'join';if(text==='multiplayer.player.left')return 'leave';}
 return new RegExp(`^${escape(target)}\\s*[➤»›>:]\\s*\\S`,'iu').test(text)?'chat':null;
}
class FleetGreetings{
 constructor(manager,{env=process.env,clock=Date.now,choose=randomInt}={}){this.manager=manager;this.target=env.GREET_TARGET_ID?.trim()?name(env.GREET_TARGET_ID):'';this.clock=clock;this.choose=choose;this.presence=new Map();this.lastSent=new Map();this.lastEvent=null;this.realmAt=new Map();this.lastSender=new Map();this.announcementAt=new Map(Object.entries(manager.store?.data?.announcementSentAt||{}));}
 configuration(id,bot){const c=settings.config(this.manager,id,'greeting',bot);if(!this.manager.store?.bot?.(id)?.greeting&&!c.targets.length&&this.target)return {...c,enabled:true,targets:[this.target]};return c;}
 targetFor(bot){if(!this.manager.store?.bot)return bot.config?.greetTarget??this.target;const entry=[...this.manager.workers.entries()].find(([,w])=>w.bot===bot);const id=entry?.[0]??bot.config?.id;if(!id)return bot.config?.greetTarget??this.target;const c=this.configuration(id,bot);return c.enabled?c.targets[0]||'':'';}
 status(target=this.target){return target?`グリーター: ON / 対象ID: ${target}\n送信形式: @${target} | 挨拶 | ランダム10文字\n全Botが担当候補。重複通知は1体だけ送信し、返事は対象ごと60秒間隔です。Webで対象・文章を複数登録できます。`:'グリーター: OFF / Webのチャット設定かRailwayのGREET_TARGET_IDで対象を登録してください。';}
 test(id){const bot=this.manager.workers.get(id)?.bot;if(!bot?.connected||bot.ended||bot.loggingOut)throw Error(`Bot${id}は未接続です`);const target=this.targetFor(bot);if(!target)throw Error(this.status(target));const text=automatic('Yo!',target);if(bot.chat(text)===false)throw Error('公開チャットを送信できませんでした');this.record(id,'test',text,target);return `テスト挨拶を送信キューへ追加しました: ${text}`;}
 record(id,kind,text,target=this.target){this.lastEvent={kind,target,sender:id,text,at:new Date(this.clock()).toISOString()};this.manager.trace?.(id,`グリーター ${kind}: ${text}（送信キューへ追加）`);}
 realm(bot){return `${bot.config?.host||''}:${bot.config?.port||19132}`;}
 candidates(observer){const source=this.manager.workers.get(observer)?.bot;if(!source?.connected)return [];return [...this.manager.workers].filter(([,w])=>w.bot.connected&&!w.bot.ended&&!w.bot.loggingOut&&!w.bot.dead&&(w.bot===source||w.bot.terrainEstablished!==false)&&this.realm(w.bot)===this.realm(source));}
 select(rows,realm){const previous=this.lastSender.get(realm),others=rows.filter(([id])=>id!==previous);return (others.length?others:rows)[this.choose((others.length?others:rows).length)];}
 handle(observer,packet){const rows=this.candidates(observer);if(!rows.length||packet.type==='whisper')return false;const now=this.clock(),realm=this.realm(rows[0][1].bot);if(now-(this.realmAt.get(realm)??-Infinity)<5000)return false;const own=new Set([...this.manager.names.values()].map(norm)),jobs=[];
  for(const [id,w]of rows){const c=this.configuration(id,w.bot);if(c.enabled)for(const watched of c.targets){if(own.has(norm(watched)))continue;const kind=event(packet,watched);if(!kind)continue;const key=kind==='chat'?realm+':chat:'+norm(watched):realm+':'+norm(watched)+':'+kind,wait=kind==='chat'?60000:5000;if(now-(this.lastSent.get(key)??-Infinity)<wait)continue;jobs.push([id,w,{kind,target:watched,key,pool:c[kind]?.length?c[kind]:pools[kind]}]);}
   const r=settings.config(this.manager,id,'replies',w.bot),chat=publicChat(packet);if(r.enabled&&chat&&!chat.message.startsWith('!')&&!own.has(norm(chat.name))&&r.targets.some(n=>norm(n)===norm(chat.name))){const key=realm+':chat:'+norm(chat.name);if(now-(this.lastSent.get(key)??-Infinity)>=60000&&r.messages.length)jobs.push([id,w,{kind:'reply',target:chat.name,key,pool:r.messages}]);}
  }
  if(!jobs.length)return false;const eligible=jobs.some(j=>j[2].kind==='reply')?jobs.filter(j=>j[2].kind==='reply'):jobs;const [id,w,job]=this.select(eligible,realm),text=automatic(job.pool[this.choose(job.pool.length)],job.target);if(w.bot.chat(text,false,{log:'greetings'})===false)return false;this.lastSent.set(job.key,now);this.realmAt.set(realm,now);this.lastSender.set(realm,id);this.record(id,job.kind,text,job.target);return true;
 }
 tick(){const now=this.clock(),realms=new Map();for(const [id,w]of this.manager.workers){const c=settings.config(this.manager,id,'announcement',w.bot);if(!c.enabled||!c.messages?.length||!w.bot.connected||w.bot.terrainEstablished===false||w.bot.dead||w.bot.ended||w.bot.loggingOut||now<(c.nextAt||0))continue;const realm=this.realm(w.bot);if(now-(this.announcementAt.get(realm)??-Infinity)<300000)continue;const rows=realms.get(realm)||[];rows.push([id,w,c]);realms.set(realm,rows);}
  for(const [realm,rows]of realms){const [id,w,c]=this.select(rows,'announcement:'+realm);if(w.bot.chat(c.messages[this.choose(c.messages.length)],false,{log:'greetings',ttlMs:15000,key:'announcement',replace:true})===false)continue;c.nextAt=now+c.intervalSeconds*1000;this.announcementAt.set(realm,now);this.lastSender.set('announcement:'+realm,id);if(this.manager.store?.data){this.manager.store.data.announcementSentAt=Object.fromEntries(this.announcementAt);this.manager.store.save();}this.manager.changed?.(id,'announcement');}
 }
 snapshot(){return {target:this.target,enabled:!!this.target,fleetDeduplicated:true,chatReplyIntervalSeconds:60,lastEvent:this.lastEvent};}
}
module.exports={FleetGreetings,event,pools};
