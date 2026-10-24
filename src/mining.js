'use strict';
const {Vec3}=require('vec3');
const {air,hazard,key,itemName}=require('./util');
const aliases={黒曜石:'obsidian',石:'stone',丸石:'cobblestone',ネザーラック:'netherrack',ネザライトブロック:'netherite_block',土:'dirt',岩盤:'bedrock',深層岩:'deepslate',砂:'sand'};
function filter(value,registry){
 const words=Array.isArray(value)?value:String(value||'all').split(/[,、\s]+/u).filter(Boolean);if(words.length===1&&['all','*','すべて'].includes(words[0]))return [];
 if(!words.length||words.length>64)throw Error('採掘するブロックを1〜64種類、またはallで指定してください');
 return [...new Set(words.map(word=>{let n=itemName(word);n=aliases[n]||n;if(/^\d+$/u.test(n))n=registry?.blocks?.[Number(n)]?.name||'';if(!n||!registry?.blocksByName?.[n])throw Error('不明なブロック: '+word);if(registry.blocksByName[n].diggable===false||registry.blocksByName[n].hardness<0)throw Error('破壊できないブロック: '+word);return n;}))];
}
function wanted(worker,block){return !worker.state.miningFilter?.length||worker.state.miningFilter.includes(block.name);}
function stands(worker,target){
 const b=worker.bot,p=b.entity.position,t=target.position,eyeReach=b.motion?.runtime?.config.blockReach||5,spots=[],navigation=require('./navigation'),geometry=require('./geometry');
 const stock=b.list?.().some(i=>i.name===worker.state.scaffold||['cobblestone','stone','dirt','obsidian','slime','slime_block'].includes(i.name));
 for(let dy=-3;dy<=1;dy++)for(let dx=-3;dx<=3;dx++)for(let dz=-3;dz<=3;dz++){
  const q=t.offset(dx,dy,dz),center=q.offset(.5,0,.5),eye=center.offset(0,1.62,0),under=b.blockAt(q.offset(0,-1,0));if(eye.distanceTo(t.offset(.5,.5,.5))>eyeReach-.1||!navigation.pass(b,q))continue;
  if(!under||under.name==='unknown'||hazard(under)||!under.solid&&(!stock||!air(under)))continue;
  if(!geometry.rayClear(b,eye,t.offset(.5,.5,.5),{ignore:[t]}))continue;
  spots.push({position:center,score:p.distanceTo(center)+(under.solid?0:4)});
 }
 return spots.sort((a,c)=>a.score-c.score).map(s=>s.position);
}
class ChunkMining{
 constructor(worker){this.worker=worker;this.bot=worker.bot;this.onUpdate=p=>{const c=this.chunk;if(c&&p.x>=c.x1&&p.x<=c.x2&&p.z>=c.z1&&p.z<=c.z2&&p.y>this.worker.state.floor&&p.y<=this.top())this.layer=Math.max(this.layer??this.top(),Math.floor(p.y));};this.bot.on('worldUpdate',this.onUpdate);this.reset();}
 top(){return Math.min(this.worker.state.ceiling,this.bot.dimensionId===1?127:this.bot.dimensionId===2?255:319);}
 reset(){this.signature='';this.chunks=[];this.index=0;this.chunk=null;this.layer=null;this.state='未開始';this.unknown=0;this.done=false;}
 prepare(){const w=this.worker,a=w.state.area,signature=JSON.stringify([a,w.state.floor,w.state.ceiling,w.state.miningFilter,w.bot.dimensionId,[...(w.manager.workers?.values()||[])].filter(o=>o.running).map(o=>o.id)]);if(signature===this.signature)return;this.signature=signature;this.chunks=[];this.index=0;this.layer=null;this.done=false;
  for(let z=a.z1>>4;z<=a.z2>>4;z++)for(let x=a.x1>>4;x<=a.x2>>4;x++){const sx=Math.max(a.x1,x*16),sz=Math.max(a.z1,z*16);if(w.manager.assigned(w,sx,sz))this.chunks.push({x,z,x1:sx,z1:sz,x2:Math.min(a.x2,x*16+15),z2:Math.min(a.z2,z*16+15)});}
  const p=this.bot.entity.position;this.chunks.sort((a,b)=>Math.hypot((a.x1+a.x2)/2-p.x,(a.z1+a.z2)/2-p.z)-Math.hypot((b.x1+b.x2)/2-p.x,(b.z1+b.z2)/2-p.z)||a.z-b.z||a.x-b.x);
 }
 scan(){this.prepare();const w=this.worker,b=this.bot,feet=b.entity.position;this.unknown=0;this.supportBlocks=[];
  for(let guard=0;guard<3;guard++){
   const c=this.chunk=this.chunks[this.index];if(!c){this.done=true;this.state='担当チャンクの指定ブロックを確認済み';return null;}
   b.worldMirror?.request(c.x,c.z,(w.state.floor+1)>>4,this.top()>>4);this.layer??=this.top();
   for(let y=this.layer;y>w.state.floor;y--){let unknown=0,blocked=false;const targets=[];
    for(let z=c.z1;z<=c.z2;z++)for(let x=c.x1;x<=c.x2;x++){
     const block=b.blockAt(new Vec3(x,y,z));if(!block||block.name==='unknown'){unknown++;continue;}
     if(air(block)||hazard(block)||!block.diggable||block.hardness<0||w.owned(block.position)||!wanted(w,block))continue;
     if(w.underPlayer(block.position)){blocked=true;this.supportBlocks.push({x,y,z});continue;}
     if((w.failed.get(key(block.position))||0)>Date.now()||w.manager.claims.has(`${b.dimensionId}:${key(block.position)}`)){blocked=true;continue;}
     targets.push(block);
    }
    this.layer=y;this.unknown=unknown;
    // Never mine a lower level while the upper one is unknown or occupied.
    if(unknown){this.state=`チャンク ${c.x},${c.z} / Y${y}の地形受信待ち`;return null;}
    if(targets.length){const usable=new Map(targets.map(t=>[t,!!(b.reach?.(t)&&b.visible?.(t))]));targets.sort((a,c)=>Number(usable.get(c))-Number(usable.get(a))||feet.distanceTo(a.position)-feet.distanceTo(c.position));this.state=`チャンク ${this.index+1}/${this.chunks.length} (${c.x},${c.z}) / Y${y}を採掘`;return targets[0];}
    if(blocked){this.state=`チャンク ${c.x},${c.z} / Y${y}の他Bot・足元・再試行待ち`;return null;}
   }
   this.index++;this.layer=null;
  }
  this.state='次の担当チャンクを確認';return null;
 }
 goal(){const c=this.chunk;if(!c)return null;return new Vec3((c.x1+c.x2)/2,this.bot.entity.position.y,(c.z1+c.z2)/2);}
 snapshot(){return {order:'chunk-top-down',filter:this.worker.state.miningFilter||[],state:this.state,chunk:this.chunk?{x:this.chunk.x,z:this.chunk.z}:null,layer:this.layer,index:this.index,total:this.chunks.length,unknown:this.unknown,done:this.done,supportBlocks:(this.supportBlocks||[]).slice(0,32)};}
 destroy(){this.bot.removeListener('worldUpdate',this.onUpdate);}
}
module.exports={ChunkMining,filter,wanted,stands};
