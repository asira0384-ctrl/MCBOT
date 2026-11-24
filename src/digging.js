'use strict';
const {air,key}=require('./util');
const {useItem,request}=require('./protocol');
const hand=require('./hand');

function legacy(bot){return bot.serverBreak!==true||bot.advertisedMovement==='client'||bot.advertisedMovement===0;}
function completion(bot,held){
 if(legacy(bot))return 'transaction';
 // Block authority and inventory authority are independent on non-vanilla
 // servers. Sending an unsupported MineBlock request can disconnect the peer.
 if(bot.serverAuthoritativeInventory!==true||bot.inventoryMode==='legacy')return 'prediction-only';
 if(!Number.isInteger(held?.stack_id)||held.stack_id<=0||held.stack_id>2147483647)throw Error('採掘道具のサーバー確認を待っています');
 return 'prediction-and-stack';
}
function face(bot,block){const d=bot.entity.position.offset(0,1.62,0).minus(block.position.offset(.5,.5,.5));const axis=['x','y','z'].sort((a,b)=>Math.abs(d[b])-Math.abs(d[a]))[0];return axis==='y'?(d.y>0?1:0):axis==='x'?(d.x>0?5:4):(d.z>0?3:2);}
function action(bot,name,position,side,old){
 if(bot.ended||bot.serverClosing)return;
 const data={action:name,position:{...position},face:side};bot.pendingBreakActions??=[];
 if(require('./movement-wire').mode(bot)==='legacy'){
  if(old)bot.client.queue('player_action',{runtime_entity_id:BigInt(bot._runtimeEntityId),...data,result_position:{...position}});
  return;
 }
 if(!require('./protocol').blockActionNames.has(name))return;
 // Progress is replaceable; start, completion and cancellation must stay ordered.
 if(['crack_break','continue_break'].includes(name))bot.pendingBreakActions=bot.pendingBreakActions.filter(a=>!['crack_break','continue_break'].includes(a.action));
 bot.pendingBreakActions.push(data);
}
function cancel(bot){const p=bot.mining,side=bot.digState?.face??1,old=bot.digState?.mode==='legacy';bot.pendingBreakActions=[];bot.pendingMiningRequest=null;bot.breakAction=null;if(p)action(bot,'abort_break',p,side,old);bot.mining=null;}
async function dig(bot,block,signal,preferredTool,options={}){
 if(signal?.aborted)throw Error('停止しました');if(bot.handUse||bot.actionHandBusy)throw require('./item-use').busy();
 block=bot.blockAt(block.position);if(!block||block.name==='unknown')throw Error('採掘するブロックの地形が未受信です');if(air(block))return false;
 if(!bot.reach(block,options.range)||!require('./mining-reach').aim(bot,block,options.range??bot.motion?.runtime?.config.blockReach??5))throw Error('ブロックに手が届きません');if(!block.diggable||block.hardness<0)throw Error('破壊できないブロックです');
 const tool=preferredTool||bot.miningTool?.(block)||bot.tool();if(!tool)throw Error('採掘する道具がありません');const profile=require('./mining-speed').estimate(bot,block,tool);if(!Number.isFinite(profile.ms))throw Error('採掘時間を確認できないブロックです');if(!profile.harvestable)throw Error(`${block.name}に適した採掘道具を補給してください`);
 const lease=hand.claim(bot,'mining'),position={x:block.position.x,y:block.position.y,z:block.position.z},old=legacy(bot),generation=bot.worldGeneration,dimension=bot.dimensionId;
 let side=face(bot,block);
 const state=bot.digState={phase:'selecting',name:block.name,position,face:side,mode:old?'legacy':'server',at:Date.now(),confirmed:false};let timer,finished=false,started=false,stopped=false,failure;
 try{
  bot.straightTimerActive=false;await bot.equip(tool.slot,signal);if(bot.inventoryOpen||bot.window)bot.closeContainer();await hand.settled(bot,signal);
  if(signal?.aborted||bot.dead||!bot.connected)throw Error('停止しました');
  bot.clearControlStates();bot.desiredMoveWorld=null;bot.desiredMoveSpeed=undefined;const aim=require('./mining-reach').aim(bot,block,options.range??bot.motion?.runtime?.config.blockReach??5);
  if(!aim||!bot.reach(block,options.range))throw Error('採掘位置が変わりました。接近し直します');
  side=state.face=aim.face;bot.lookAt(aim.point,false);
  bot.pendingBreakActions=[];bot.pendingMiningRequest=null;bot.breakAction=null;
  const held=bot.items[bot.quickBarSlot];if(bot.name(held)!==tool.name)throw Error('手に持ったピッケルを確認できません');state.completion=completion(bot,held);
  const breakMs=Math.max(50,bot.breakTime(block,{...tool,raw:held})),begin=Date.now();state.breakMs=breakMs;state.profile=profile;state.phase='breaking';state.startedAt=begin;
  bot.mining=position;started=true;action(bot,'start_break',position,side,old);hand.flush(bot);let predicted=false;
  const update=()=>{
   if(failure||bot.mining!==position)return;
   try{
    if(signal?.aborted||bot.dead||!bot.connected||bot.worldGeneration!==generation||bot.dimensionId!==dimension)throw Error('停止・切断・世界が変わりました');
    if(bot.handUse||bot.name(bot.items[bot.quickBarSlot])!==tool.name)throw Error('採掘中に手のアイテムが変わりました');
    if(!bot.reach(block,options.range))throw Error('採掘中にブロックから離れました');
    if(air(bot.blockAt(block.position)))return;
    const elapsed=Date.now()-begin;
    state.elapsedMs=elapsed;state.remainingMs=Math.max(0,breakMs-elapsed);
    if(!predicted&&elapsed>=breakMs){
     const currentHeld=bot.items[bot.quickBarSlot];state.completion=completion(bot,currentHeld);predicted=true;state.phase='confirming';state.predictedAt=Date.now();
     // Stack-authoritative peers require the prediction and durability request
     // in one input frame. Legacy-inventory peers process block prediction only.
     // https://mojang.github.io/bedrock-protocol-docs/guides/block-breaking-overview/
     if(old){bot.client.queue('inventory_transaction',useItem(bot,'break_block',position,side,block.stateId));action(bot,'stop_break',position,side,true);stopped=true;}
     else{action(bot,'predict_break',position,side,false);if(state.completion==='prediction-and-stack'){const id=bot.requestId--;bot.pendingMiningRequest=request(id,[{type_id:'mine_block',hotbar_slot:bot.quickBarSlot,predicted_durability:bot.damage(currentHeld)+1,network_id:currentHeld.stack_id}]).requests[0];}}
     hand.flush(bot);
    }else if(!predicted){action(bot,old?'crack_break':'continue_break',position,side,old);}
   }catch(error){failure=error;}
  };
  const progress=()=>{update();if(predicted&&!state.refreshedAt&&Date.now()-state.predictedAt>=350&&bot.mining===position){state.refreshedAt=Date.now();bot.worldMirror?.request(position.x>>4,position.z>>4,position.y>>4,position.y>>4,{force:true});}};
  timer=setInterval(progress,50);progress();
  await bot.waitUntil(()=>{if(failure)throw failure;if(bot.worldGeneration!==generation||bot.dimensionId!==dimension)throw Error('採掘中に世界が変わりました');const current=bot.blockAt(block.position);if(current&&air(current)){finished=true;state.phase='confirmed';state.confirmed=true;state.confirmedAt=Date.now();return true;}return false;},options.timeout||Math.min(90000,Math.max(5000,breakMs*2+3000)),signal);
 }catch(error){state.phase=signal?.aborted?'cancelled':'unconfirmed';state.error=error.message;if(!signal?.aborted&&state.predictedAt&&!finished&&!failure&&bot.connected&&bot.worldGeneration===generation)error.code='DIG_UNCONFIRMED';throw error;}
 finally{
  clearInterval(timer);if(started){if(!finished)cancel(bot);else{bot.pendingBreakActions=(bot.pendingBreakActions||[]).filter(a=>a.action==='stop_break'||key(a.position)!==key(position));bot.pendingMiningRequest=null;bot.mining=null;if(!stopped)action(bot,'stop_break',position,side,old);}hand.flush(bot);}hand.release(bot,lease);
 }
 return finished;
}
module.exports={dig,cancel,action,legacy,completion,face};
