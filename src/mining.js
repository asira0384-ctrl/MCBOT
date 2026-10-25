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
function sameWorld(a,b){return a.bot.dimensionId===b.bot.dimensionId&&String(a.bot.config?.host||'').toLowerCase()===String(b.bot.config?.host||'').toLowerCase()&&Number(a.bot.config?.port||19132)===Number(b.bot.config?.port||19132);}
function sameJob(a,b){return sameWorld(a,b)&&JSON.stringify(a.state.area)===JSON.stringify(b.state.area)&&a.state.floor===b.state.floor&&a.state.ceiling===b.state.ceiling&&JSON.stringify(a.state.miningFilter||[])===JSON.stringify(b.state.miningFilter||[]);}
function stands(worker,target,{allowScaffold=true}={}){
 const b=worker.bot,p=b.entity.position,t=target.position,eyeReach=b.motion?.runtime?.config.blockReach||5,spots=[],navigation=require('./navigation'),geometry=require('./geometry');
 const stock=allowScaffold&&worker.state.scaffoldEnabled!==false&&b.list?.().some(i=>i.name===worker.state.scaffold||['cobblestone','stone','dirt','obsidian','slime','slime_block'].includes(i.name));
 for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++)for(let dz=-3;dz<=3;dz++){
  const q=t.offset(dx,dy,dz),center=q.offset(.5,0,.5),eye=center.offset(0,1.62,0),under=b.blockAt(q.offset(0,-1,0));if(eye.distanceTo(t.offset(.5,.5,.5))>eyeReach-.1||!navigation.pass(b,q))continue;
  if(!under||under.name==='unknown'||hazard(under)||!under.solid&&(!stock||!air(under)))continue;
  if(!geometry.rayClear(b,eye,t.offset(.5,.5,.5),{ignore:[t]}))continue;
  spots.push({position:center,score:p.distanceTo(center)+(under.solid?0:9)});
 }
 return spots.sort((a,c)=>a.score-c.score).map(s=>s.position);
}
class ChunkMining{
 constructor(worker){this.worker=worker;this.bot=worker.bot;this.onUpdate=p=>{for(const c of this.allChunks||[])if(p.x>=c.x1&&p.x<=c.x2&&p.z>=c.z1&&p.z<=c.z2&&p.y>this.worker.state.floor&&p.y<=this.top()){c.layer=Math.max(c.layer??this.top(),Math.floor(p.y));c.dirty=true;this.done=false;this.layer=Math.max(this.layer??this.top(),Math.floor(p.y));}};this.onTerrain=({x,z,top})=>{const c=this.allChunks.find(c=>c.x===x&&c.z===z);if(c){c.layer=Math.max(c.layer,Math.min(this.top(),top));c.dirty=true;this.done=false;}};this.bot.on('worldUpdate',this.onUpdate);this.bot.on('terrainColumn',this.onTerrain);this.reset();}
 top(){return Math.min(this.worker.state.ceiling,this.bot.dimensionId===1?127:this.bot.dimensionId===2?255:319);}
 reset(){this.signature='';this.chunks=[];this.allChunks=[];this.index=0;this.chunk=null;this.layer=null;this.state='未開始';this.unknown=0;this.done=false;this.assisting=false;this.exploreGoal=null;}
 prepare(){const w=this.worker,a=w.state.area,signature=JSON.stringify([a,w.state.floor,w.state.ceiling,w.state.miningFilter,w.bot.dimensionId,[...(w.manager.workers?.values()||[])].filter(o=>o.running&&o.bot.connected&&!o.bot.dead&&sameJob(w,o)).map(o=>o.id)]);if(signature===this.signature)return;this.signature=signature;this.chunks=[];this.allChunks=[];this.index=0;this.layer=null;this.done=false;
  for(let z=a.z1>>4;z<=a.z2>>4;z++)for(let x=a.x1>>4;x<=a.x2>>4;x++){const c={x,z,x1:Math.max(a.x1,x*16),z1:Math.max(a.z1,z*16),x2:Math.min(a.x2,x*16+15),z2:Math.min(a.z2,z*16+15),layer:this.top(),dirty:true};this.allChunks.push(c);if(w.manager.assigned(w,c.x1,c.z1))this.chunks.push(c);}
  const p=this.bot.entity.position;this.chunks.sort((a,b)=>Math.hypot((a.x1+a.x2)/2-p.x,(a.z1+a.z2)/2-p.z)-Math.hypot((b.x1+b.x2)/2-p.x,(b.z1+b.z2)/2-p.z)||a.z-b.z||a.x-b.x);
 }
 layerBlocks(c,y){const out=[],w=this.worker;let unknown=0;for(let z=c.z1;z<=c.z2;z++)for(let x=c.x1;x<=c.x2;x++){
  const block=this.bot.blockAt(new Vec3(x,y,z));if(!block||block.name==='unknown'){unknown++;continue;}
  if(air(block)||hazard(block)||!block.diggable||block.hardness<0||(w.owned(block.position)||this.otherOwned?.has(key(block.position)))||!wanted(w,block))continue;out.push(block);
 }return {blocks:out,unknown};}
 scan(){this.prepare();const w=this.worker,b=this.bot;this.otherOwned=new Set([...w.manager.workers.values()].filter(other=>other!==w&&sameWorld(w,other)).flatMap(other=>Object.values(other.state?.owned||{}).filter(o=>o.dimension===b.dimensionId).map(o=>key(o.p))));this.unknown=0;this.supportBlocks=[];this.waitingBlocked=false;this.surveying=false;let budget=8192;
  // Survey every chunk's highest remaining layer before descending. Other
  // bots' assigned chunks are included in this barrier, so a nearby thin edge
  // cannot pull this bot under a still-solid roof in the main chunk.
  for(const c of this.allChunks){if(!c.dirty)continue;b.worldMirror?.request(c.x,c.z,(w.state.floor+1)>>4,this.top()>>4);
   for(;c.layer>w.state.floor;c.layer--){const size=(c.x2-c.x1+1)*(c.z2-c.z1+1);if(budget<size){this.surveying=true;this.state='範囲全体の上段を確認中';return null;}budget-=size;const found=this.layerBlocks(c,c.layer);if(found.blocks.length||found.unknown){c.dirty=false;break;}}
   if(c.layer<=w.state.floor)c.dirty=false;
  }
  this.layer=Math.max(w.state.floor,...this.allChunks.map(c=>c.layer));
  if(this.layer<=w.state.floor){this.done=true;this.state='範囲全体の指定ブロックを上から確認済み';return null;}
  const preferred=this.chunks.filter(c=>c.layer===this.layer),borrowed=this.allChunks.filter(c=>c.layer===this.layer&&!preferred.includes(c)),feet=b.entity.position;
  borrowed.sort((a,c)=>Math.hypot((a.x1+a.x2)/2-feet.x,(a.z1+a.z2)/2-feet.z)-Math.hypot((c.x1+c.x2)/2-feet.x,(c.z1+c.z2)/2-feet.z));
  const active=[...preferred,...borrowed];if(this.chunk&&active.includes(this.chunk))active.splice(active.indexOf(this.chunk),1),active.unshift(this.chunk);
  const reserved=new Set([...w.manager.workers.values()].filter(other=>other!==w&&other.running&&other.bot.connected&&sameWorld(w,other)&&other.approachPlan&&other.miningTarget&&(other.failed.get(key(other.miningTarget.position))||0)<=Date.now()).map(other=>key(other.miningTarget.position)));let waitingTerrain=null;
  for(const c of active){const found=this.layerBlocks(c,this.layer);if(!found.blocks.length&&!found.unknown){c.dirty=true;continue;}
   if(found.unknown){b.worldMirror?.request(c.x,c.z,(w.state.floor+1)>>4,this.top()>>4);waitingTerrain??=c;continue;}
   const targets=[];for(const block of found.blocks){if(w.underPlayer(block.position)&&!w.canDropThrough?.(block)){this.supportBlocks.push({...block.position});continue;}if((w.failed.get(key(block.position))||0)>Date.now()||w.manager.claims.has(`${b.dimensionId}:${key(block.position)}`)||reserved.has(key(block.position)))continue;targets.push(block);}
   if(targets.length){this.chunk=c;this.index=this.allChunks.indexOf(c);this.assisting=!this.chunks.includes(c);const usable=new Map(targets.map(t=>[t,!!(b.reach?.(t)&&b.visible?.(t))]));targets.sort((a,c)=>Number(usable.get(c))-Number(usable.get(a))||feet.distanceTo(a.position)-feet.distanceTo(c.position));this.state=`上から採掘${this.assisting?'・空いたBotで応援':''} / Y${this.layer} / チャンク ${this.index+1}/${this.allChunks.length} (${c.x},${c.z})`;return targets[0];}
  }
  if(active.some(c=>c.dirty))return this.scan();if(waitingTerrain){this.chunk=waitingTerrain;this.unknown=this.layerBlocks(waitingTerrain,this.layer).unknown;this.state=`チャンク ${waitingTerrain.x},${waitingTerrain.z} / Y${this.layer}の地形受信待ち`;return null;}this.waitingBlocked=true;this.state=`Y${this.layer}の足元・他Bot・経路の再試行待ち（下段には進みません）`;return null;
 }
 goal(){const c=this.chunk;if(!c||this.surveying||this.waitingBlocked)return null;const b=this.bot,p=b.entity.position,navigation=require('./navigation'),destination=new Vec3((c.x1+c.x2)/2,p.y,(c.z1+c.z2)/2),old=this.exploreGoal;
  if(old&&old.chunk===c&&Date.now()-old.at<5000&&p.distanceTo(old.position)>.5&&navigation.pass(b,old.position.floored()))return old.position;
  const spots=[],base=p.floored(),maxDrop=this.worker.runtime?.travel.dropLimit?.()??64;
  for(let dx=-10;dx<=10;dx+=2)for(let dz=-10;dz<=10;dz+=2){let q=base.offset(dx,0,dz),under=b.blockAt(q.offset(0,-1,0));if(!under||under.name==='unknown')continue;if(!under.solid)q=navigation.dropLanding(b,q,maxDrop);if(!q||!navigation.pass(b,q))continue;const position=q.offset(.5,0,.5),remaining=Math.hypot(position.x-destination.x,position.z-destination.z);if(remaining>Math.hypot(p.x-destination.x,p.z-destination.z)-1.5)continue;spots.push({position,remaining});}
  spots.sort((a,c)=>a.remaining-c.remaining);for(const {position}of spots.slice(0,8)){const path=navigation.groundPath(b,p,position,{maxDrop,limit:450});if(path.reached&&path.length){this.exploreGoal={chunk:c,position,at:Date.now()};return position;}}return null;
 }
 snapshot(){return {order:'layer-top-down',filter:this.worker.state.miningFilter||[],state:this.state,chunk:this.chunk?{x:this.chunk.x,z:this.chunk.z}:null,layer:this.layer,index:this.index,total:this.allChunks.length,assisting:!!this.assisting,unknown:this.unknown,done:this.done,surveying:!!this.surveying,waitingBlocked:!!this.waitingBlocked,supportBlocks:(this.supportBlocks||[]).slice(0,32)};}
 destroy(){this.bot.removeListener('worldUpdate',this.onUpdate);this.bot.removeListener('terrainColumn',this.onTerrain);}
}
module.exports={ChunkMining,filter,wanted,stands,sameWorld,sameJob};
