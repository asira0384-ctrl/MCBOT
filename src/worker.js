'use strict';
const {Vec3}=require('vec3');const {sleep,key,air,solid,hazard,emptyStats,addStat,canDiscard}=require('./util');
class Worker {
 constructor(manager,id,bot){this.manager=manager;this.id=id;this.bot=bot;this.state=manager.store.bot(id);this.mode='stopped';this.running=false;this.busy=false;this.receiving=false;this.lastReceive=0;this.lastEat=0;this.failed=new Map();this.missing='';this.corrections=[];
  bot.on('inventory',(old,item)=>{if(item?.network_id&&(!old||item.network_id!==old.network_id||item.count>old.count)){
   this.lastReceive=Date.now();if(this.receiving){const name=bot.name(item);if(bot.registry?.blocksByName[name]){this.state.scaffold=name;this.receivedBlock=true;manager.store.save();}}
  }});
  bot.on('health',()=>{if(bot.health!==null&&bot.health<12&&bot.health>0&&this.mode!=='healing'){bot.halt();}});
  bot.on('forcedMove',()=>{if(bot.passivePhysics&&!this.running)return;this.corrections=this.corrections.filter(t=>Date.now()-t<10000);this.corrections.push(Date.now());if(this.corrections.length>=5){this.stop();this.notice('ロールバックが続いたので停止しました');}});
  bot.on('death',()=>{this.mode='dead';this.running=false;this.notice('死亡しました。装備の補給待ちです');});
  bot.on('respawnReady',()=>{if(this.state.respawn){try{bot.respawn();this.mode='waiting';this.missing='死亡後の装備';}catch(e){this.notice(e.message);}}});
  this.timer=setInterval(()=>this.tick().catch(e=>{this.stop();this.notice(e.message);}),300);
 }
 notice(text){this.manager.notice(this.id,text);}
 stop(){this.running=false;this.receiving=false;this.receivedBlock=false;this.mode='stopped';this.bot.halt();this.abort?.abort();}
 start(){if(this.busy)throw Error('前の操作が終わるまで少し待ってください');if(!this.state.area||this.state.floor===null)throw Error('area と floor を先に指定してください');if(this.bot.terrainReady===false)throw Error('Botの足元の地形をまだ受信していません。messagesでサーバー案内を確認してください');if(!this.bot.connected||this.bot.dead)throw Error('Botが接続していません');if(this.state.supplyPending)throw Error('補給途中の箱があります。recover を実行してください');this.bot.passivePhysics=false;this.running=true;this.mode='running';this.missing='';}
 receive(){this.stop();this.receiving=true;this.mode='receiving';this.lastReceive=0;this.receivedBlock=false;this.notice('足場ブロックを渡してください。最後の受け取りから3秒後に再開します');}
 inArea(p){const a=this.state.area;return a&&p.x>=a.x1&&p.x<=a.x2&&p.z>=a.z1&&p.z<=a.z2&&p.y>this.state.floor&&p.y<=this.state.ceiling;}
 owned(p){return this.state.owned[`${this.bot.dimensionId}:${key(p)}`];}
 recordOwned(p,kind,name){this.state.owned[`${this.bot.dimensionId}:${key(p)}`]={p:{x:p.x,y:p.y,z:p.z},kind,name,dimension:this.bot.dimensionId};this.manager.store.save();}
 removeOwned(p){delete this.state.owned[`${this.bot.dimensionId}:${key(p)}`];this.manager.store.save();}
 underPlayer(p){return [...this.manager.workers.values()].some(w=>{const q=w.bot.entity?.position;return w.bot.dimensionId===this.bot.dimensionId&&q&&Math.abs(q.x-(p.x+.5))<.9&&Math.abs(q.z-(p.z+.5))<.9&&q.y>=p.y&&q.y<=p.y+2;});}
 async tick(){if(this.busy||!this.bot.connected||this.bot.dead)return;
  if(this.receiving){if(this.receivedBlock&&this.lastReceive&&Date.now()-this.lastReceive>=3000){this.receiving=false;try{this.start();this.notice(`足場 ${this.state.scaffold} で再開しました`);}catch(e){this.mode='stopped';this.notice(e.message);}}return;}
  if(!this.running&&this.mode!=='waiting')return;
  this.busy=true;this.abort=new AbortController();const signal=this.abort.signal;
  try {
   if(this.bot.health===null){this.mode='waiting_health';return;}
   if(this.bot.health<12){this.mode='healing';if(!this.bot.find('enchanted_golden_apple'))return this.wait('エンチャント金リンゴ');
    if(Date.now()-this.lastEat>=5000){await this.bot.eat(signal);this.lastEat=Date.now();}return;}
   const missing=!this.bot.tool()?'ピッケル':!this.bot.find('enchanted_golden_apple')?'エンチャント金リンゴ':!this.bot.find(this.state.scaffold)?'足場ブロック':null;
   if(missing){if(this.state.autoSupply&&Date.now()-(this.lastSupply||0)>60000&&this.bot.find('ender_chest')){this.lastSupply=Date.now();await this.supply(signal);}else this.wait(missing);return;}
   if(this.mode==='waiting'){if(!this.lastReceive||Date.now()-this.lastReceive<3000)return;this.bot.passivePhysics=false;this.running=true;this.mode='running';this.missing='';this.notice('補給を確認しました。再開します');}
   if(!this.running)return;this.mode='running';await this.discard(signal);await this.cleanup(signal);
   const target=this.chooseTarget();if(!target){await this.explore(signal);return;}
   const reservation=`${this.bot.dimensionId}:${key(target.position)}`;if(this.manager.claims.has(reservation))return;this.manager.claims.set(reservation,this.id);
   try{if(this.bot.reach(target)&&this.bot.visible(target)){await this.bot.dig(target,signal);if(signal.aborted)return;
      if(!this.owned(target.position)){addStat(this.state.stats,target.name);addStat(this.state.session,target.name);this.recordMined(target.name);this.manager.store.save();}
     }else await this.approach(target,signal);
   }catch(e){if(signal.aborted)return;if(this.bot.health<12)return;this.failed.set(key(target.position),Date.now()+30000);throw e;}finally{this.manager.claims.delete(reservation);}
  }catch(e){if(!signal.aborted&&this.running&&this.bot.health>=12){this.stop();this.notice(e.message);}}finally{this.busy=false;}
 }
 recordMined(name){const drop={stone:'cobblestone',deepslate:'cobbled_deepslate',grass_block:'dirt',snow:'snowball',redstone_ore:'redstone',coal_ore:'coal',diamond_ore:'diamond',emerald_ore:'emerald',lapis_ore:'lapis_lazuli',nether_quartz_ore:'quartz',glowstone:'glowstone_dust',glass:null};
  for(const n of [name,drop[name]])if(n&&!this.state.minedItems.includes(n))this.state.minedItems.push(n);}
 wait(missing){this.mode='waiting';this.running=false;if(this.missing!==missing){this.missing=missing;this.lastReceive=0;this.notice(`${missing}がなくなりました。補給待ちです`);}}
 chooseTarget(){const p=this.bot.entity.position;const candidates=[];const a=this.state.area;
  for(let dx=-10;dx<=10;dx++)for(let dz=-10;dz<=10;dz++){const x=Math.floor(p.x)+dx,z=Math.floor(p.z)+dz;if(x<a.x1||x>a.x2||z<a.z1||z>a.z2||!this.manager.assigned(this,x,z))continue;
   this.bot.worldMirror.request(x>>4,z>>4,(Math.floor(p.y)-4)>>4,(Math.floor(p.y)+16)>>4);
   for(let y=Math.min(this.state.ceiling,Math.floor(p.y)+14);y>=Math.max(this.state.floor+1,Math.floor(p.y)-2);y--){const b=this.bot.blockAt(new Vec3(x,y,z));if(!b||air(b)||hazard(b)||!b.diggable||b.hardness<0||this.owned(b.position)||this.underPlayer(b.position))continue;
    if((this.failed.get(key(b.position))||0)>Date.now())continue;const r=`${this.bot.dimensionId}:${key(b.position)}`;if(this.manager.claims.has(r))continue;
    const distance=p.distanceTo(b.position);candidates.push({b,score:distance-(y-p.y)*.3+(this.bot.reach(b)&&this.bot.visible(b)?-30:0)});break;
   }}
  candidates.sort((a,b)=>a.score-b.score);return candidates[0]?.b;
 }
 async approach(target,signal){const t=target.position,p=this.bot.entity.position;const spots=[];
  for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++)for(let dy=-1;dy<=1;dy++){const q=new Vec3(t.x+dx,Math.floor(p.y)+dy,t.z+dz);if(air(this.bot.blockAt(q))&&air(this.bot.blockAt(q.offset(0,1,0)))&&solid(this.bot.blockAt(q.offset(0,-1,0))))spots.push(q);}
  spots.sort((a,b)=>p.distanceTo(a)-p.distanceTo(b));for(const spot of spots.slice(0,3)){try{await this.bot.go(spot,signal);if(this.bot.reach(target))return;}catch(e){if(signal.aborted||this.bot.health<12)throw e;}}
  await this.buildStep(t,signal);
 }
 async placeOwned(pos,item,kind,signal){const k=`${this.bot.dimensionId}:${key(pos)}`;if(this.manager.claims.has(k))throw Error('他のBotがこの場所を操作中です');this.manager.claims.set(k,this.id);try{await this.bot.place(pos,item,signal);this.recordOwned(pos,kind,item.name);}finally{this.manager.claims.delete(k);}}
 async buildStep(target,signal){const p=this.bot.entity.position;const feet=new Vec3(Math.floor(p.x),Math.round(p.y),Math.floor(p.z));
  const dirs=[[1,0],[-1,0],[0,1],[0,-1]].sort((a,b)=>Math.hypot(feet.x+a[0]-target.x,feet.z+a[1]-target.z)-Math.hypot(feet.x+b[0]-target.x,feet.z+b[1]-target.z));
  const rise=target.y>feet.y+2?1:0;
  for(const[dx,dz]of dirs){const place=feet.offset(dx,rise-1,dz),stand=place.offset(0,1,0);if(!air(this.bot.blockAt(place))||!air(this.bot.blockAt(stand))||!air(this.bot.blockAt(stand.offset(0,1,0))))continue;
   const item=this.bot.find(this.state.scaffold);if(!item)throw Error('足場ブロックがなくなりました');if(rise===1&&!solid(this.bot.blockAt(place.offset(0,-1,0)))){const lower=place.offset(0,-1,0);if(!air(this.bot.blockAt(lower)))continue;await this.placeOwned(lower,item,'scaffold',signal);}
   await this.placeOwned(place,this.bot.find(this.state.scaffold),'scaffold',signal);await this.bot.go(stand,signal);return;
  }throw Error('進める経路・足場の設置場所がありません。場所を移して再開してください');
 }
 async explore(signal){const a=this.state.area,p=this.bot.entity.position;const center=new Vec3(Math.floor((a.x1+a.x2)/2),Math.floor(p.y),Math.floor((a.z1+a.z2)/2));
  // Survey a finite grid; only mark completion when loaded cells have all been inspected.
  this.survey??=0;const width=a.x2-a.x1+1,depth=a.z2-a.z1+1;const cols=Math.ceil(width/8),rows=Math.ceil(depth/8);if(this.survey>=cols*rows){this.stop();this.notice('周辺の走査を終えました。未読込・到達不可の場所があり得るため、整地完了とは判定していません');return;}
  const i=this.survey++;const x=Math.min(a.x2,a.x1+(i%cols)*8+4),z=Math.min(a.z2,a.z1+Math.floor(i/cols)*8+4);
  if(!this.manager.assigned(this,x,z))return;
  let dest=null;for(let y=Math.min(this.state.ceiling,Math.floor(p.y)+3);y>=Math.max(this.state.floor+1,Math.floor(p.y)-3);y--){const q=new Vec3(x,y,z);if(air(this.bot.blockAt(q))&&air(this.bot.blockAt(q.offset(0,1,0)))&&solid(this.bot.blockAt(q.offset(0,-1,0)))){dest=q;break;}}
  if(dest)await this.bot.go(dest,signal);else await this.buildStep(center,signal);
 }
 async cleanup(signal){const p=this.bot.entity.position;for(const owned of Object.values(this.state.owned)){
  if(owned.kind!=='scaffold'||owned.dimension!==this.bot.dimensionId)continue;const q=new Vec3(owned.p.x,owned.p.y,owned.p.z),b=this.bot.blockAt(q);if(b&&air(b)){this.removeOwned(q);continue;}
  if(!b||b.name!==owned.name||!this.bot.reach(b)||this.underPlayer(q)||q.distanceTo(p)<2)continue;
  // Retain any support of another owned block, and any support under an occupied player column.
  if(Object.values(this.state.owned).some(o=>o.dimension===owned.dimension&&o.p.x===q.x&&o.p.z===q.z&&o.p.y===q.y+1))continue;
  await this.bot.dig(b,signal);this.removeOwned(q);break;
 }}
 async discard(signal){const sums=new Map();for(const i of this.bot.list())if(this.state.minedItems.includes(i.name)&&canDiscard(i.name,this.state.scaffold))sums.set(i.name,(sums.get(i.name)||0)+i.count);
  for(const[name,count]of sums){const limit=this.bot.registry.itemsByName[name]?.stackSize||64;if(count<limit)continue;let left=limit;for(const i of this.bot.list().filter(i=>i.name===name)){if(signal.aborted)return;const n=Math.min(left,i.count);await this.bot.drop(i.slot,n);left-=n;if(!left)break;}}
 }
 supplySpot(exclude){const p=this.bot.entity.position;for(const[dx,dz]of [[1,0],[-1,0],[0,1],[0,-1],[2,0],[0,2],[-2,0],[0,-2]]){const q=new Vec3(Math.floor(p.x)+dx,Math.floor(p.y),Math.floor(p.z)+dz);if(exclude&&key(q)===key(exclude))continue;if(air(this.bot.blockAt(q))&&air(this.bot.blockAt(q.offset(0,1,0)))&&solid(this.bot.blockAt(q.offset(0,-1,0))))return q;}throw Error('補給用チェストを置く場所がありません');}
 wanted(name){return name===this.state.scaffold||name==='enchanted_golden_apple'||/_pickaxe$/.test(name);}
 async takeSupplies(window,signal){let taken=0;for(let slot=0;slot<window.items.length;slot++){const raw=window.items[slot];if(!raw||!this.wanted(this.bot.name(raw)))continue;if(this.bot.items.filter(i=>!i).length<=2)break;const dest=this.bot.items.findIndex(i=>!i);if(dest<0)break;if(signal.aborted)throw Error('停止');await this.bot.transfer(true,slot,false,dest);taken++;}return taken;}
 async supply(signal){this.mode='supplying';const tool=this.bot.tool(true);if(!tool)throw Error('エンダーチェスト回収用のシルクタッチ付きピッケルが必要です');
  if(this.bot.items.filter(i=>!i).length<3)throw Error('自動補給にはインベントリの空き3枠が必要です');
  const chestPos=this.supplySpot();await this.placeOwned(chestPos,this.bot.find('ender_chest'),'ender_chest',signal);this.state.supplyPending={chest:{x:chestPos.x,y:chestPos.y,z:chestPos.z},box:null};this.manager.store.save();
  try{let chest=await this.bot.openContainer(chestPos,signal);await this.takeSupplies(chest,signal);
   for(let slot=0;slot<chest.items.length;slot++){
    const raw=chest.items[slot];if(!raw||!/shulker_box$/.test(this.bot.name(raw)))continue;
    const empty=this.bot.items.findIndex(i=>!i);if(empty<0)break;const boxName=this.bot.name(raw);await this.bot.transfer(true,slot,false,empty);this.bot.closeContainer();
    const boxPos=this.supplySpot(chestPos);this.state.supplyPending.box={x:boxPos.x,y:boxPos.y,z:boxPos.z,name:boxName};this.manager.store.save();await this.placeOwned(boxPos,this.bot.find(boxName),'shulker',signal);
    const box=await this.bot.openContainer(boxPos,signal);if(box.items.length!==27)throw Error('シュルカーの27枠を確認できません');await this.takeSupplies(box,signal);const isEmpty=box.items.every(i=>!i||!i.network_id);this.bot.closeContainer();await this.recoverBox(boxPos,boxName,isEmpty,chestPos,signal);
    chest=await this.bot.openContainer(chestPos,signal);
    if(this.bot.tool()&&this.bot.find('enchanted_golden_apple')&&this.bot.find(this.state.scaffold))break;
   }this.bot.closeContainer();await this.recoverChest(chestPos,signal);this.state.supplyPending=null;this.manager.store.save();
   if(!this.bot.tool()||!this.bot.find('enchanted_golden_apple')||!this.bot.find(this.state.scaffold))this.wait('必要な補給品');else{this.mode='running';this.notice('エンダーチェストから補給しました');}
  }finally{this.bot.closeContainer();}
 }
 async collectPlaced(pos,name,signal,tool){const count=this.bot.count(name);const previousIds=new Set(this.bot.list().filter(i=>i.name===name).map(i=>i.raw.stack_id));const b=this.bot.blockAt(pos);await this.bot.dig(b,signal,tool);this.removeOwned(pos);
  const walk=new Vec3(pos.x,Math.floor(this.bot.entity.position.y),pos.z);if(air(this.bot.blockAt(walk))&&solid(this.bot.blockAt(walk.offset(0,-1,0))))await this.bot.go(walk,signal);
  await this.bot.waitUntil(()=>this.bot.count(name)>count,6000,signal);const received=this.bot.list().find(i=>i.name===name&&!previousIds.has(i.raw.stack_id));if(!received)throw Error('回収した箱の識別ができません。保持して停止します');return received;
 }
 async recoverBox(pos,name,isEmpty,chestPos,signal){this.state.supplyPending.box={...this.state.supplyPending.box,empty:isEmpty,phase:'recovering'};this.manager.store.save();const item=await this.collectPlaced(pos,name,signal);this.state.supplyPending.box={...this.state.supplyPending.box,phase:'carried',stackId:item.raw.stack_id};this.manager.store.save();if(!item)throw Error('シュルカーを回収できません');if(isEmpty)await this.bot.drop(item.slot,1);else{
   const chest=await this.bot.openContainer(chestPos,signal);const dest=chest.items.findIndex(i=>!i);if(dest<0)throw Error('エンダーチェストに空きがありません。中身入りシュルカーを保持して停止します');await this.bot.transfer(false,item.slot,true,dest,1);this.bot.closeContainer();
  }this.state.supplyPending.box=null;this.manager.store.save();}
 async recoverChest(pos,signal){const tool=this.bot.tool(true);if(!tool)throw Error('シルクタッチのピッケルを補給してください');await this.collectPlaced(pos,'ender_chest',signal,tool);}
 async recover(){if(this.busy)throw Error('操作完了まで待ってください');const pending=this.state.supplyPending;if(!pending)throw Error('補給途中の箱はありません');this.busy=true;this.abort=new AbortController();const signal=this.abort.signal;
  try{const cp=new Vec3(pending.chest.x,pending.chest.y,pending.chest.z);if(pending.box?.phase==='carried'){const item=this.bot.list().find(i=>i.raw.stack_id===pending.box.stackId&&i.name===pending.box.name);if(!item)throw Error('保持したシュルカーが見つかりません。手動確認が必要です');if(pending.box.empty)await this.bot.drop(item.slot,1);else{const chest=await this.bot.openContainer(cp,signal);const dest=chest.items.findIndex(i=>!i);if(dest<0)throw Error('エンダーチェストに空きがありません');await this.bot.transfer(false,item.slot,true,dest,1);this.bot.closeContainer();}pending.box=null;this.manager.store.save();}
   if(pending.box){const q=new Vec3(pending.box.x,pending.box.y,pending.box.z);const b=this.bot.blockAt(q);if(b&&!air(b)){const w=await this.bot.openContainer(q,signal);if(w.items.length!==27)throw Error('シュルカーの内容未確認');const empty=w.items.every(i=>!i);this.bot.closeContainer();await this.recoverBox(q,pending.box.name,empty,cp,signal);}else throw Error('箱の状態が変わりました。手動で回収し、Discordのclear-recoveryを使ってください');}
   await this.recoverChest(cp,signal);this.state.supplyPending=null;this.manager.store.save();this.mode='stopped';return '補給用の箱を回収しました。startで再開できます';
  }finally{this.busy=false;this.bot.closeContainer();}}
 destroy(){this.stop();clearInterval(this.timer);this.bot.disconnect();}
 status(){return {number:this.id,name:this.bot.username,mode:this.mode,connectionPhase:this.bot.connectionPhase,endpoint:{host:this.bot.config?.host,port:this.bot.config?.port},terrainReady:this.bot.terrainReady,passivePhysics:this.bot.passivePhysics,serverPosition:this.bot.serverPosition,positionCorrections:this.bot.positionCorrections||0,packets:this.bot.packetCounts,lastDisconnect:this.bot.lastDisconnect,position:this.bot.entity?.position,health:this.bot.health===null?null:this.bot.health/2,missing:this.missing,scaffold:this.state.scaffold,stats:this.state.stats,session:this.state.session,ownedScaffolds:Object.values(this.state.owned).filter(o=>o.kind==='scaffold').length};}
}
module.exports={Worker};
