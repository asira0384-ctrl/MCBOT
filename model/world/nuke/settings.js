'use strict';
// GUI uses two inclusive corners. Existing miner uses floor-exclusive bounds.
const {filter}=require('../mining/mining');
function values(s){
 const saved=s.nukeCorners;
 const area=s.miningChunks?.length&&saved&&s.area&&
  s.area.x1===(saved.x1>>4)*16&&s.area.x2===(saved.x2>>4)*16+15&&
  s.area.z1===(saved.z1>>4)*16&&s.area.z2===(saved.z2>>4)*16+15?saved:s.area;
 return {Dash:s.nukeDash!==false,LavaMode:s.nukeLavaMode!==false,'Chunk Break':!!s.miningChunks?.length,'Start X':String(area?.x1??0),'Start Y':String((s.floor??0)+1),'Start Z':String(area?.z1??0),'End X':String(area?.x2??16),'End Y':String(s.ceiling??127),'End Z':String(area?.z2??16),Range:s.miningRange??5,ItemDrop:s.itemDrop!==false,Scaffold:s.scaffoldEnabled!==false,'Scaffold Block':s.scaffold||'cobblestone','Max Drop':s.maxDrop??64,Blocks:s.miningFilter?.join(', ')||'all'};}
function plan(v,registry){
 const p={};for(const side of ['Start','End'])for(const axis of ['X','Y','Z']){const k=side+' '+axis,text=String(v[k]).trim(),n=Number(text);if(!text||!Number.isInteger(n)||Math.abs(n)>(axis==='Y'?319:30000000)||axis==='Y'&&n< -64)throw Error(k+': 整数の座標を入力してください（Yは-64〜319）');p[k]=n;}
 const x1=Math.min(p['Start X'],p['End X']),x2=Math.max(p['Start X'],p['End X']),z1=Math.min(p['Start Z'],p['End Z']),z2=Math.max(p['Start Z'],p['End Z']);
 if(((x2>>4)-(x1>>4)+1)*((z2>>4)-(z1>>4)+1)>1024)throw Error('採掘範囲は1024チャンク以内にしてください');
 const block=v['Scaffold Block'].replace(/^minecraft:/,'');if(!/^[a-z0-9_]+$/.test(block)||!registry.blocksByName[block]||registry.blocksByName[block].boundingBox==='empty')throw Error('Scaffold Block: 足場に使うブロックIDを確認してください');
 const corners={x1,x2,z1,z2};
 const region={area:corners,nukeCorners:corners,miningChunks:[]};
 if(v['Chunk Break']){
  const chunks=require('../mining/mining-settings');
  chunks.apply(region,chunks.rectangle([x1>>4,z1>>4,x2>>4,z2>>4]));
 }
 return {...region,nukeDash:v.Dash!==false,nukeLavaMode:v.LavaMode!==false,floor:Math.min(p['Start Y'],p['End Y'])-1,ceiling:Math.max(p['Start Y'],p['End Y']),miningFilter:filter(v.Blocks,registry),miningRange:v.Range,itemDrop:v.ItemDrop!==false,scaffoldEnabled:v.Scaffold,scaffold:block,maxDrop:v['Max Drop']};
}
module.exports = { values, plan };
