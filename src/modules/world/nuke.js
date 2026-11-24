'use strict';
// GUI uses two inclusive corners. Existing miner uses floor-exclusive bounds.
const {filter}=require('../../mining');
function values(s){return {'Start X':String(s.area?.x1??0),'Start Y':String((s.floor??0)+1),'Start Z':String(s.area?.z1??0),'End X':String(s.area?.x2??16),'End Y':String(s.ceiling??127),'End Z':String(s.area?.z2??16),Range:s.miningRange??5,Scaffold:s.scaffoldEnabled!==false,'Scaffold Block':s.scaffold||'cobblestone','Max Drop':s.maxDrop??64,Blocks:s.miningFilter?.join(', ')||'all'};}
function plan(v,registry){
 const p={};for(const side of ['Start','End'])for(const axis of ['X','Y','Z']){const k=side+' '+axis,text=String(v[k]).trim(),n=Number(text);if(!text||!Number.isInteger(n)||Math.abs(n)>(axis==='Y'?319:30000000)||axis==='Y'&&n< -64)throw Error(k+': 整数の座標を入力してください（Yは-64〜319）');p[k]=n;}
 const x1=Math.min(p['Start X'],p['End X']),x2=Math.max(p['Start X'],p['End X']),z1=Math.min(p['Start Z'],p['End Z']),z2=Math.max(p['Start Z'],p['End Z']);
 if(((x2>>4)-(x1>>4)+1)*((z2>>4)-(z1>>4)+1)>1024)throw Error('採掘範囲は1024チャンク以内にしてください');
 const block=v['Scaffold Block'].replace(/^minecraft:/,'');if(!/^[a-z0-9_]+$/.test(block)||!registry.blocksByName[block]||registry.blocksByName[block].boundingBox==='empty')throw Error('Scaffold Block: 足場に使うブロックIDを確認してください');
 return {area:{x1,x2,z1,z2},floor:Math.min(p['Start Y'],p['End Y'])-1,ceiling:Math.max(p['Start Y'],p['End Y']),miningChunks:[],miningFilter:filter(v.Blocks,registry),miningRange:v.Range,scaffoldEnabled:v.Scaffold,scaffold:block,maxDrop:v['Max Drop']};
}
function apply(m,id,v,on){const s=m.store.bot(id),w=m.workers.get(id);if(on===false){require('../../mining-lifecycle').disable(s);w?.stop();return 'Nuke stopped';}
 const registry=w?.bot.registry||require('minecraft-data')('bedrock_1.21.2'),next=plan(v,registry);
 const changed=JSON.stringify([s.area,s.floor,s.ceiling,s.miningFilter,s.miningChunks])!==JSON.stringify([next.area,next.floor,next.ceiling,next.miningFilter,next.miningChunks]);
 const resume=on===true||!!(w?.running||w?.startRequested);if(changed)w?.stop();Object.assign(s,next);delete s.miningDimension;
 if(w?.runtime)w.runtime.travel.groundPlan=null;
 if(on===true&&!w)throw Error('Botを接続してからNukeを有効にしてください');
 if(resume&&w&&(changed||on===true)){w.start();return 'Nuke started: 指定したXYZ範囲を上から採掘します';}
 return resume?'Nuke updated: 採掘を継続します':'Nuke settings saved';
}
module.exports={values,plan,apply};
