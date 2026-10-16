'use strict';
const point=p=>p?{x:p.x,y:p.y,z:p.z}:null;
function markPhysics(bot,mode,reason){const at=Date.now();bot.physicsState={mode,reason,since:bot.physicsState?.mode===mode?bot.physicsState.since:at,at};}
function sample(runtime){
 const b=runtime.bot,p=b.entity;
 return {at:Date.now(),bps:runtime.telemetry?.value?.bps||0,verticalBps:runtime.telemetry?.value?.verticalBps||0,antiPausedUntil:runtime.burrowBlockedUntil||0,speedPausedUntil:runtime.speedBlockedUntil||0,desiredMoveWorld:b.desiredMoveWorld||null,restock:runtime.restock?.snapshot(),position:point(p?.position),serverPosition:point(b.serverPosition),velocity:point(p?.velocity),onGround:!!p?.onGround,
  tick:b.tick,physics:b.physicsState?{...b.physicsState}:null,connected:!!b.connected,dead:!!b.dead,health:b.health,
  controls:{...b.controlState},terrainReady:!!b.terrainReady,terrainEstablished:!!b.terrainEstablished,terrainDecodeFailed:!!b.terrainDecodeFailed,
  sentInputs:b.sentInputs,sentLegacyMoves:b.sentLegacyMoves,corrections:b.positionCorrections||0,
  busy:!!runtime.busy,operation:runtime.operation||null,paused:!!runtime.paused,workerBusy:!!runtime.worker?.busy,
  flight:runtime.travel?.flight?{goal:point(runtime.travel.flight.goal),paused:runtime.travel.flight.paused||false,landing:!!runtime.travel.flight.landing,jetpack:!!runtime.travel.flight.jetpack}:null,
  movement:runtime.travel?.waiting||'',combatWaiting:runtime.combatWaiting||'',crystalState:runtime.crystals?.state||'',
  consumption:b.handUse?{...b.handUse}:null,lastItemUse:b.lastItemUse||null,timerActive:!!b.straightTimerActive,legacyMovementFallback:!!b.legacyMovementFallback,
  combatBusy:!!runtime.combatBusy,roof:runtime.travel?.flight?.roof?.snapshot()||null,inventoryResponse:b.lastStackResponse||null,inventoryOpen:!!b.inventoryOpen,inventoryOpenState:b.inventoryOpenState,inventoryOpenRequests:b.inventoryOpenRequests};
}
function reasons(runtime){
 const b=runtime.bot,out=[];
 if(!b.connected)out.push('未接続です');
 if(b.dead)out.push('死亡状態・リスポーン待ちです');
 if(b.physicsState?.mode==='terrain_wait')out.push('足元の地形が未受信または判別不能で、移動と落下を止めています');
 if(b.physicsState?.mode==='collision_hold')out.push('体と受信ブロックが重なり、サーバーの位置補正を待っています');
 if(runtime.travel?.flight?.paused)out.push(runtime.travel.flight.holdGlide?'飛行の迂回経路を再探索中です。開始した滑空を維持しています':'飛行は中断中です。通常物理へ戻しています');
 if(runtime.travel?.embed)out.push('AntiCrystalの埋まり動作中です');
 if(runtime.paused)out.push('操作は停止状態です。移動先の指定や機能のON操作で再開します');
 if(runtime.busy)out.push('実行・応答待ち: '+(runtime.operation||'処理中'));
 if(runtime.worker?.busy)out.push('整地側の処理が実行中です');
 for(const [feature,error]of Object.entries(runtime.featureErrors||{}))out.push(feature+': '+error.message);
 if(runtime.combatWaiting)out.push(runtime.combatWaiting);
 if(runtime.crystals?.state&&runtime.crystals.state!=='OFF')out.push(runtime.crystals.state);
 return out.length?out:['現在の記録には停止理由がありません。動かない操作を実行してからレポートを保存してください'];
}
function blockSnapshot(bot,p){
 const block=bot.blockAt?.(p);
 return {position:point(p),received:!!block,name:block?.name||null,stateId:block?.stateId,solid:!!block?.solid,boundingBox:block?.boundingBox,shapes:block?.shapes};
}
class DebugRecorder{
 constructor(runtime){
  this.runtime=runtime;this.samples=[];this.events=[];this.lastSample=0;
  this.onTick=()=>{if(Date.now()-this.lastSample>=500)this.capture();};
  this.onCorrection=()=>{this.events.push({at:Date.now(),kind:'server_correction',serverPosition:point(runtime.bot.serverPosition),normalization:runtime.bot.lastPositionNormalization});this.events=this.events.slice(-40);this.capture();};
  runtime.bot.on('physicsTick',this.onTick);runtime.bot.on('forcedMove',this.onCorrection);this.capture();
 }
 capture(){const now=Date.now();if(this.samples.length&&now-this.lastSample<500)return;this.lastSample=now;this.samples.push(sample(this.runtime));this.samples=this.samples.slice(-120);}
 report(){
  const r=this.runtime,b=r.bot,p=b.entity?.position,nearby=[],column=[];
  if(p){const base=p.floored();for(let x=-1;x<=1;x++)for(let z=-1;z<=1;z++)for(let y=-2;y<=2;y++)nearby.push(blockSnapshot(b,base.offset(x,y,z)));
   for(let y=-16;y<=3;y++)column.push(blockSnapshot(b,base.offset(0,y,0)));}
  return {reasons:reasons(r),current:sample(r),movementMode:b.movementMode,advertisedMovement:b.advertisedMovement,
   physicsLoopRunning:!!b._physicsInterval,lastPacketAgeMs:b.lastPacketAt?Date.now()-b.lastPacketAt:null,nearby,column,
   samples:this.samples,events:this.events,visiblePlayers:[...(b.actors?.values()||[])].filter(a=>a.player).slice(0,80).map(a=>({name:a.name,position:point(a.position),ageMs:a.seen?Date.now()-a.seen:null,dimension:a.dimension}))};
 }
 summary(){return reasons(this.runtime).join('\n');}
 destroy(){this.runtime.bot.removeListener('physicsTick',this.onTick);this.runtime.bot.removeListener('forcedMove',this.onCorrection);}
}
module.exports={DebugRecorder,markPhysics,reasons};
