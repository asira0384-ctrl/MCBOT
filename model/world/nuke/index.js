'use strict';
const { values, plan } = require('./settings');
function apply(m,id,v,on){const s=m.store.bot(id),w=m.workers.get(id);if(on===false){require('../mining/mining-lifecycle').disable(s);delete s.nukePending;if(w)w.resumeOnConnect=false;if(w?.runtime)w.runtime.resumeMining=false;w?.stop();return 'Nuke stopped';}
 const registry=w?.bot.registry||require('minecraft-data')('bedrock_1.21.2'),next=plan(v,registry);
 const changed=JSON.stringify([s.area,s.floor,s.ceiling,s.miningFilter,s.miningChunks,s.nukeLavaMode!==false])!==JSON.stringify([next.area,next.floor,next.ceiling,next.miningFilter,next.miningChunks,next.nukeLavaMode]);
 const resume=on===true||!!(w?.running||w?.startRequested||s.nukeEnabled);if(changed)w?.stop();Object.assign(s,next);delete s.miningDimension;
 if(w?.runtime)w.runtime.travel.groundPlan=null;
 if(on===true)s.nukeEnabled=true;
 if(resume&&(!w||w.bot.connected===false||w.bot.dead)){s.nukeEnabled=true;s.nukePending=true;if(on===true)delete s.nukeWorld;if(w)w.resumeOnConnect=true;return 'Nuke queued: Botの接続・リスポーン後に開始します';}
 if(on===true&&w)s.nukePending=false;
 if(on===true&&!changed&&w?.running)return 'Nuke ON: 採掘を継続中';
 if(resume&&w&&(changed||on===true)){if(w.start()===false)return 'Nuke 開始待ち: '+w.missing;return 'Nuke ON: '+(s.miningChunks.length?s.miningChunks.length+'チャンクの採掘処理を開始':'指定範囲の採掘処理を開始');}
 return resume?'Nuke updated: 採掘を継続します':'Nuke settings saved';
}
module.exports={values,plan,apply};
