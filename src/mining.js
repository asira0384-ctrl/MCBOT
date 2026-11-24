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
function sameJob(a,b){return sameWorld(a,b)&&JSON.stringify(a.state.miningChunks||[])===JSON.stringify(b.state.miningChunks||[])&&JSON.stringify(a.state.area)===JSON.stringify(b.state.area)&&a.state.floor===b.state.floor&&a.state.ceiling===b.state.ceiling&&JSON.stringify(a.state.miningFilter||[])===JSON.stringify(b.state.miningFilter||[]);}
function columnBusy(w,q){for(const o of w.manager?.workers?.values()||[]){if(o===w||!o.bot.connected||o.bot.dead||!sameWorld(w,o))continue;const p=o.bot.entity?.position;if(p&&Math.floor(p.x)===q.x&&Math.floor(p.z)===q.z&&Math.abs(p.y-q.y)<3)return true;}return false;}
function stands(worker,target,{allowScaffold=true}={}){
 const b=worker.bot,p=b.entity.position,t=target.position,eyeReach=worker.state.miningRange||b.motion?.runtime?.config.blockReach||5,spots=[],navigation=require('./navigation'),geometry=require('./geometry');
 const stock=allowScaffold&&worker.state.scaffoldEnabled!==false&&b.list?.().some(i=>i.name===worker.state.scaffold||['cobblestone','stone','dirt','obsidian','slime','slime_block'].includes(i.name));
 for(let dy=-5;dy<=3;dy++)for(let dx=-3;dx<=3;dx++)for(let dz=-3;dz<=3;dz++){
  const q=t.offset(dx,dy,dz);if(q.y<Math.min(Math.floor(p.y),t.y))continue;const center=q.offset(.5,0,.5),eye=center.offset(0,1.62,0),under=b.blockAt(q.offset(0,-1,0));if(eye.distanceTo(t.offset(.5,.5,.5))>eyeReach-.1||!navigation.pass(b,q))continue;
  if(columnBusy(worker,q))continue;if(!under||under.name==='unknown'||hazard(under)||!under.solid&&(!stock||!air(under)))continue;
  if(!geometry.rayClear(b,eye,t.offset(.5,.5,.5),{ignore:[t]}))continue;
  spots.push({position:center,score:p.distanceTo(center)+(under.solid?0:9)});
 }
 return spots.sort((a,c)=>a.score-c.score).map(s=>s.position);
}
class ChunkMining{
 constructor(worker){this.worker=worker;this.bot=worker.bot;this.onUpdate=p=>{const w=this.worker;const changed=this.bot.blockAt(new Vec3(p.x,p.y,p.z));if(changed?.diggable&&!air(changed)&&!w.manager.claims.has(this.bot.dimensionId+':'+key(p))){for(const peer of w.manager.workers.values()){if(!peer.running||!sameWorld(w,peer)||!peer.miningTarget||p.y<=peer.miningTarget.position.y||!peer.inArea(p)||!wanted(peer,changed))continue;peer.abort?.abort();peer.approachPlan=null;const c=peer.miner?.allChunks.find(c=>c.x===(p.x>>4)&&c.z===(p.z>>4));if(c){c.layer=Math.max(c.layer,p.y);c.dirty=true;}}}this.cache?.delete(`${p.x>>4},${p.z>>4}`);for(const c of [this.chunkMap?.get(`${p.x>>4},${p.z>>4}`)].filter(Boolean))if(p.x>=c.x1&&p.x<=c.x2&&p.z>=c.z1&&p.z<=c.z2&&p.y>this.worker.state.floor&&p.y<=this.top()){c.layer=Math.max(c.layer??this.top(),Math.floor(p.y));c.dirty=true;this.done=false;this.layer=Math.max(this.layer??this.top(),Math.floor(p.y));}};this.onTerrain=({x,z,top})=>{this.cache?.delete(`${x},${z}`);const c=this.chunkMap?.get(`${x},${z}`);if(c){c.layer=Math.max(c.layer,Math.min(this.top(),top));c.dirty=true;this.done=false;}};this.bot.on('worldUpdate',this.onUpdate);this.bot.on('terrainColumn',this.onTerrain);this.reset();}
 top(){return Math.min(this.worker.state.ceiling,this.bot.dimensionId===1?127:this.bot.dimensionId===2?255:319);}
 reset(){this.cache=new Map();this.chunkMap=new Map();this.requested=new Map();this.metrics={reads:0,scanMs:0};this.signature='';this.chunks=[];this.allChunks=[];this.index=0;this.chunk=null;this.layer=null;this.state='未開始';this.unknown=0;this.done=false;this.assisting=false;this.exploreGoal=null;}
 prepare(){const w=this.worker,a=w.state.area;
  this.peers=[...(w.manager.workers?.values()||[])].filter(o=>o.running&&o.bot.connected&&!o.bot.dead&&sameJob(w,o)).sort((a,b)=>a.id-b.id);
  const signature=JSON.stringify([a,w.state.miningChunks,w.state.floor,w.state.ceiling,w.state.miningFilter,w.bot.dimensionId]);
  if(signature!==this.signature){this.signature=signature;this.members=null;this.cache.clear();this.chunkMap.clear();this.chunks=[];this.allChunks=[];this.index=0;this.layer=null;this.done=false;
   const coords=w.state.miningChunks?.length?w.state.miningChunks:(()=>{const out=[];for(let z=a.z1>>4;z<=a.z2>>4;z++)for(let x=a.x1>>4;x<=a.x2>>4;x++)out.push([x,z]);return out;})();
   for(const [x,z]of coords){const c={x,z,x1:Math.max(a.x1,x*16),z1:Math.max(a.z1,z*16),x2:Math.min(a.x2,x*16+15),z2:Math.min(a.z2,z*16+15),layer:this.top(),dirty:true};this.allChunks.push(c);this.chunkMap.set(`${x},${z}`,c);}
  }
  const members=this.peers.map(o=>o.id).join(',');if(this.members!==members){this.members=members;const cols=(a.x2>>4)-(a.x1>>4)+1,index=this.peers.indexOf(w),count=this.peers.length;
   this.chunks=this.allChunks.filter(c=>count<2||((c.z-(a.z1>>4))*cols+c.x-(a.x1>>4))%count===index);
  }
  const pos=this.bot.entity.position,d=c=>Math.hypot((c.x1+c.x2)/2-pos.x,(c.z1+c.z2)/2-pos.z);this.chunks.sort((a,b)=>d(a)-d(b)||a.z-b.z||a.x-b.x);
 }
 request(c){const now=Date.now(),k=`${c.x},${c.z}`;if(now-(this.requested.get(k)||0)<2000)return;this.requested.set(k,now);this.bot.worldMirror?.request(c.x,c.z,(this.worker.state.floor+1)>>4,this.top()>>4);}

 layerBlocks(c,y){const out=[],w=this.worker;let unknown=0;for(let z=c.z1;z<=c.z2;z++)for(let x=c.x1;x<=c.x2;x++){
  const point=new Vec3(x,y,z);let block=this.bot.blockAt(point);if(!block||block.name==='unknown'){for(const peer of this.peers||[]){if(peer===w)continue;const seen=peer.bot.blockAt(point);if(seen&&seen.name!=='unknown'){block=seen;break;}}}if(!block||block.name==='unknown'){unknown++;continue;}
  if(air(block)||hazard(block)||!block.diggable||block.hardness<0||(w.owned(block.position)||this.otherOwned?.has(key(block.position)))||!wanted(w,block))continue;out.push(block);
 }return {blocks:out,unknown};}
 scan(){this.prepare();const w=this.worker,b=this.bot;this.otherOwned=new Set([...w.manager.workers.values()].filter(other=>other!==w&&sameWorld(w,other)).flatMap(other=>Object.values(other.state?.owned||{}).filter(o=>o.dimension===b.dimensionId).map(o=>key(o.p))));this.unknown=0;this.supportBlocks=[];this.waitingBlocked=false;this.surveying=false;const began=performance.now();let budget=2048,reads=0;const memo=new Map(),read=(c,y)=>{const k=c.x+","+c.z+","+y,cacheKey=`${c.x},${c.z}`;if(memo.has(k))return memo.get(k);const old=this.cache.get(cacheKey);if(old&&old.y===y&&Date.now()-old.at<500){memo.set(k,old.value);return old.value;}const cost=(c.x2-c.x1+1)*(c.z2-c.z1+1);if(budget<cost||reads&&performance.now()-began>3)return null;budget-=cost;reads+=cost;const value=this.layerBlocks(c,y);if(this.cache.size>=64)this.cache.delete(this.cache.keys().next().value);this.cache.set(cacheKey,{y,at:Date.now(),value});memo.set(k,value);return value;};
  const finish=value=>{this.metrics={reads,scanMs:+(performance.now()-began).toFixed(3),cacheSize:this.cache.size};return value;};
  // Limit top-down coordination to nearby chunks, not the entire cuboid.
  const own=new Set(this.chunks),feet=b.entity.position,distance=c=>Math.hypot((c.x1+c.x2)/2-feet.x,(c.z1+c.z2)/2-feet.z);
  const remaining=this.allChunks.filter(c=>c.dirty||c.layer>w.state.floor);
  remaining.sort((a,c)=>Number(own.has(c))-Number(own.has(a))||distance(a)-distance(c));
  if(this.chunk&&remaining.includes(this.chunk)&&distance(this.chunk)<48){remaining.splice(remaining.indexOf(this.chunk),1);remaining.unshift(this.chunk);}
  const ordered=remaining.slice(0,8);
  for(const c of ordered){if(!c.dirty)continue;this.request(c);
   for(;c.layer>w.state.floor;c.layer--){const found=read(c,c.layer);if(!found){this.surveying=true;break;}if(found.blocks.length||found.unknown){c.dirty=false;break;}}
   if(c.layer<=w.state.floor)c.dirty=false;if(this.surveying)break;
  }
  this.layer=Math.max(w.state.floor,...ordered.map(c=>c.layer));
  if(this.layer<=w.state.floor){if(this.allChunks.some(c=>c.layer>w.state.floor||c.dirty)){this.surveying=true;this.state='次の担当チャンクへ進みます';return finish(null);}this.done=true;this.state='範囲全体の指定ブロックを上から確認済み';return finish(null);}
  const preferred=ordered.filter(c=>own.has(c)&&c.layer===this.layer),borrowed=ordered.filter(c=>!own.has(c)&&c.layer===this.layer);
  borrowed.sort((a,c)=>Math.hypot((a.x1+a.x2)/2-feet.x,(a.z1+a.z2)/2-feet.z)-Math.hypot((c.x1+c.x2)/2-feet.x,(c.z1+c.z2)/2-feet.z));
  const active=[...preferred,...borrowed];if(this.chunk&&active.includes(this.chunk))active.splice(active.indexOf(this.chunk),1),active.unshift(this.chunk);
  const reserved=new Set([...w.manager.workers.values()].filter(other=>other!==w&&other.running&&other.bot.connected&&sameWorld(w,other)&&(other.busy||other.approachPlan)&&other.miningTarget&&(other.failed.get(key(other.miningTarget.position))||0)<=Date.now()).map(other=>key(other.miningTarget.position)));let waitingTerrain=null;
  for(const c of active){const found=read(c,this.layer);if(!found)continue;if(!found.blocks.length&&!found.unknown){c.dirty=true;continue;}
   if(found.unknown){this.request(c);waitingTerrain??=c;if(!found.blocks.length)continue;}
   const targets=[];for(const block of found.blocks){if(w.underPlayer(block.position)){this.supportBlocks.push({...block.position});continue;}if((w.failed.get(key(block.position))||0)>Date.now()||w.manager.claims.has(`${b.dimensionId}:${key(block.position)}`)||reserved.has(key(block.position)))continue;targets.push(block);}
   if(targets.length){this.chunk=c;this.index=this.allChunks.indexOf(c);this.assisting=!this.chunks.includes(c);targets.sort((a,c)=>feet.distanceTo(a.position)-feet.distanceTo(c.position));const usable=new Set(targets.slice(0,12).filter(t=>b.reach?.(t)&&b.visible?.(t)));targets.sort((a,c)=>Number(usable.has(c))-Number(usable.has(a))||feet.distanceTo(a.position)-feet.distanceTo(c.position));this.state=`上から採掘${this.assisting?'・空いたBotで応援':''} / Y${this.layer} / チャンク ${this.index+1}/${this.allChunks.length} (${c.x},${c.z})`;return finish(targets[0]);}
  }
  if(this.surveying||active.some(c=>c.dirty)){this.surveying=true;this.state='範囲の上段を分割して確認中';return finish(null);}
  if(waitingTerrain){this.chunk=waitingTerrain;this.unknown=read(waitingTerrain,this.layer)?.unknown||0;this.state=`チャンク ${waitingTerrain.x},${waitingTerrain.z} / Y${this.layer}の地形受信待ち`;return finish(null);}
  this.waitingBlocked=true;this.state=`Y${this.layer}の足元・他Bot・経路の再試行待ち`;return finish(null);
 }
 goal(){const c=this.chunk;if(!c||this.surveying||this.waitingBlocked)return null;const b=this.bot,p=b.entity.position,navigation=require('./navigation'),destination=new Vec3((c.x1+c.x2)/2,p.y,(c.z1+c.z2)/2),old=this.exploreGoal;
  if(old&&old.chunk===c&&Date.now()-old.at<5000&&p.distanceTo(old.position)>.5&&navigation.pass(b,old.position.floored()))return old.position;
  const spots=[],base=p.floored(),maxDrop=this.worker.runtime?.travel.dropLimit?.()??64;
  for(let dx=-10;dx<=10;dx+=2)for(let dz=-10;dz<=10;dz+=2){let q=base.offset(dx,0,dz),under=b.blockAt(q.offset(0,-1,0));if(!under||under.name==='unknown')continue;if(!under.solid)q=navigation.dropLanding(b,q,maxDrop);if(!q||!navigation.pass(b,q))continue;const position=q.offset(.5,0,.5),remaining=Math.hypot(position.x-destination.x,position.z-destination.z);if(remaining>Math.hypot(p.x-destination.x,p.z-destination.z)-1.5)continue;spots.push({position,remaining});}
  spots.sort((a,c)=>a.remaining-c.remaining);for(const {position}of spots.slice(0,8)){const path=navigation.groundPath(b,p,position,{maxDrop,limit:450});if(path.reached&&path.length){this.exploreGoal={chunk:c,position,at:Date.now()};return position;}}return null;
 }
 snapshot(){return {scan:this.metrics,order:'layer-top-down',filter:this.worker.state.miningFilter||[],state:this.state,chunk:this.chunk?{x:this.chunk.x,z:this.chunk.z}:null,layer:this.layer,index:this.index,total:this.allChunks.length,assisting:!!this.assisting,unknown:this.unknown,done:this.done,surveying:!!this.surveying,waitingBlocked:!!this.waitingBlocked,supportBlocks:(this.supportBlocks||[]).slice(0,32)};}
 destroy(){this.bot.removeListener('worldUpdate',this.onUpdate);this.bot.removeListener('terrainColumn',this.onTerrain);}
}
module.exports={columnBusy,ChunkMining,filter,wanted,stands,sameWorld,sameJob};
