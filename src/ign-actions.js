'use strict';
const {name}=require('./chat-output');
const defaults={autoKit:false,kitName:'',autoTpa:false,tpaPlayer:'',autoBack:false,autoWorld:false,worldName:'cpe'};
function kitName(value){const text=String(value||'').trim();if(!/^[\p{L}\p{N}_.: -]{1,64}$/u.test(text))throw Error('kit名を1〜64文字で指定してください');return text;}
function worldName(value){const text=String(value||'cpe').trim();if(!/^[a-zA-Z0-9_-]{1,32}$/.test(text))throw Error('World名は半角英数字・_・-の32文字以内です');return text;}
const argument=text=>/\s/.test(text)?JSON.stringify(text):text;
class IgnActions{
 get enabled(){return require('./realms').isIgn(this.runtime);}
 constructor(runtime){this.runtime=runtime;this.bot=runtime.bot;this.settings=runtime.worker.state.ignActions=Object.assign({},defaults,runtime.worker.state.ignActions);this.queue=[];this.epoch=0;this.last='';
  this.onDeath=()=>{this.epoch++;this.queue=[];};this.onRespawn=()=>{if(!this.enabled)return;const c=this.settings,commands=[];if(c.autoWorld)commands.push('.world '+worldName(c.worldName));if(c.autoKit&&c.kitName)commands.push('/kit '+argument(kitName(c.kitName)));if(c.autoBack)commands.push('/back');if(c.autoTpa&&c.tpaPlayer)commands.push('/tpa '+argument(name(c.tpaPlayer)));this.queue=commands;this.nextAt=Date.now()+700;this.expires=Date.now()+30000;};this.bot.on('death',this.onDeath);this.bot.on('respawned',this.onRespawn);
 }
 dispatch(command){if(command.startsWith('.world ')){const accepted=this.bot.world?this.bot.world(command.slice(7)):this.bot.chat(command,false,{dedupeMs:5000});if(accepted===false)throw Error('World移動の送信は待機中です');}else this.bot.command(command);this.last=command+' の送信を要求';this.runtime.notice('IGNへ送信要求: '+command,false);return command;}
 send(action,value){if(!this.enabled)throw Error('この機能は接続先がIGNのBot専用です');let command;if(action==='kit')command='/kit '+argument(kitName(value||this.settings.kitName));else if(action==='tpa')command='/tpa '+argument(name(value||this.settings.tpaPlayer));else if(action==='back')command='/back';else if(action==='world')command='.world '+worldName(value||this.settings.worldName);else throw Error('IGN操作が不正です');return this.dispatch(command);}
 tick(){const b=this.bot;if(!this.enabled||!this.queue.length||b.dead||!b.connected)return;if(Date.now()>this.expires){this.queue=[];this.last='リスポーン後の操作は期限切れです';return;}if(Date.now()<this.nextAt||!b.terrainReady)return;const command=this.queue[0];try{this.dispatch(command);this.queue.shift();this.nextAt=Date.now()+(command.startsWith('.world ')?5000:1200);}catch(e){this.last=e.message;this.nextAt=Date.now()+1200;}}
 snapshot(){return {...this.settings,enabled:this.enabled,settings:{...this.settings},pending:[...this.queue],last:this.last};}
 destroy(){this.bot.removeListener('death',this.onDeath);this.bot.removeListener('respawned',this.onRespawn);this.queue=[];}
}
module.exports={IgnActions,defaults,kitName,worldName};
