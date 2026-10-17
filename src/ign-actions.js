'use strict';
const {name}=require('./chat-output');
const defaults={autoKit:false,kitName:'',autoTpa:false,tpaPlayer:'',autoBack:false};
function kitName(value){const text=String(value||'').trim();if(!/^[\p{L}\p{N}_.: -]{1,64}$/u.test(text))throw Error('kit名を1〜64文字で指定してください');return text;}
const argument=text=>/\s/.test(text)?JSON.stringify(text):text;
class IgnActions{
 constructor(runtime){this.runtime=runtime;this.bot=runtime.bot;this.enabled=runtime.worker.id===11;this.settings=runtime.worker.state.ignActions=Object.assign({},defaults,runtime.worker.state.ignActions);this.queue=[];this.epoch=0;this.onDeath=()=>{this.epoch++;this.queue=[];};this.onRespawn=()=>{if(!this.enabled)return;const c=this.settings,commands=[];if(c.autoKit&&c.kitName)commands.push('/kit '+argument(kitName(c.kitName)));if(c.autoBack)commands.push('/back');if(c.autoTpa&&c.tpaPlayer)commands.push('/tpa '+argument(name(c.tpaPlayer)));this.queue=commands;this.nextAt=Date.now()+700;this.expires=Date.now()+30000;};this.bot.on('death',this.onDeath);this.bot.on('respawned',this.onRespawn);}
 send(action,value){if(!this.enabled)throw Error('この機能はIGNのBot11専用です');let command;if(action==='kit')command='/kit '+argument(kitName(value||this.settings.kitName));else if(action==='tpa')command='/tpa '+argument(name(value||this.settings.tpaPlayer));else if(action==='back')command='/back';else throw Error('IGN操作が不正です');this.bot.command(command);this.runtime.notice('IGNへ送信: '+command,false);return command;}
 tick(){const b=this.bot;if(!this.enabled||!this.queue.length||b.dead||!b.connected)return;if(Date.now()>this.expires){this.queue=[];return;}if(Date.now()<this.nextAt||!b.terrainReady)return;const command=this.queue.shift();b.command(command);this.nextAt=Date.now()+1200;this.runtime.notice('リスポーン後のIGN操作: '+command,false);}
 snapshot(){return {...this.settings,enabled:this.enabled,settings:{...this.settings},pending:[...this.queue]};}
 destroy(){this.bot.removeListener('death',this.onDeath);this.bot.removeListener('respawned',this.onRespawn);this.queue=[];}
}
module.exports={IgnActions,defaults,kitName};
