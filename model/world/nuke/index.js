'use strict';
const { values, plan } = require('./settings');
function apply(m,id,v,on){const s=m.store.bot(id),w=m.workers.get(id);if(on===false){require('../mining/mining-lifecycle').disable(s);w?.stop();return 'Nuke stopped';}
 const registry=w?.bot.registry||require('minecraft-data')('bedrock_1.21.2'),next=plan(v,registry);
 const changed=JSON.stringify([s.area,s.floor,s.ceiling,s.miningFilter,s.miningChunks])!==JSON.stringify([next.area,next.floor,next.ceiling,next.miningFilter,next.miningChunks]);
 const resume=on===true||!!(w?.running||w?.startRequested);if(changed)w?.stop();Object.assign(s,next);delete s.miningDimension;
 if(w?.runtime)w.runtime.travel.groundPlan=null;
 if(on===true&&!w)throw Error('Botを接続してからNukeを有効にしてください');
 if(resume&&w&&(changed||on===true)){if(w.start()===false)return 'Nuke 開始待ち: '+w.missing;return 'Nuke started: 指定したXYZ範囲を上から採掘します';}
 return resume?'Nuke updated: 採掘を継続します':'Nuke settings saved';
}
module.exports={values,plan,apply};
