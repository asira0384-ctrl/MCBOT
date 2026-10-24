'use strict';
const {setTimeout:wait}=require('node:timers/promises');
const {useItem,emptyItem}=require('./protocol');
function busy(){return Object.assign(Error('飲食中の手の操作が完了するまで待機します'),{code:'HAND_BUSY'});}
function protects(bot,type,slot){return !!bot.handUse&&(['hotbar_and_inventory','inventory','hotbar'].includes(type))&&(bot.handUse.slot===undefined||bot.handUse.slot===slot);}
async function consume(bot,item,kind,signal){
 if(bot.handUse||bot.actionHandBusy)throw busy();if(!item)throw Error('飲食アイテムがありません');
 const state={kind,phase:'selecting',name:item.name,originalSlot:item.slot,startedAt:Date.now(),attempt:0};bot.handUse=state;bot.straightTimerActive=false;
 try{
  // A pending break / repeated equipment packet cancels eating on Nukkit.
  bot.mining=null;bot.breakAction=null;bot.pendingBreakActions=[];bot.pendingMiningRequest=null;bot.setControlState('sprint',false);
  await bot.equip(item.slot,signal);await require('./hand').settled(bot,signal);if(signal?.aborted)throw Error('停止しました');
  const slot=bot.quickBarSlot,held=bot.items[slot];if(bot.name(held)!==item.name)throw Error('手に持った飲食アイテムを確認できません');
  state.slot=slot;const metadata=held.metadata||0,initialCount=held.count||0;
  const count=()=>bot.items.reduce((n,i)=>n+(i&&bot.name(i)===item.name&&(i.metadata||0)===metadata?(i.count||0):0),0),before=count();
  const changed=()=>{const current=bot.items[slot],name=bot.name(current),transition=!current||kind==='potion'&&name==='glass_bottle'||name===item.name&&(current.metadata||0)===metadata&&(current.count||0)<initialCount;return transition&&count()<before;};
  const confirmed=()=>changed()||!!state.serverConsumedAt;
  // Count wall-clock time, not callbacks. Busy terrain/path calculations used
  // to turn a 1.65s use into tens of seconds by counting every late timer as 50ms.
  const pause=async(ms,using=false)=>{let deadline=Date.now()+ms;while(Date.now()<deadline&&!confirmed()){if(using&&state.serverCancelledAt)return;if(using&&bot.itemUseDurationMs===undefined&&state.serverUsingAt)deadline=Math.max(deadline,state.serverUsingAt+ms);await wait(Math.min(50,deadline-Date.now()),undefined,{signal});if(!bot.connected||bot.dead)throw Error('停止・切断しました');}};
  const legacy=bot.serverAuthoritativeInventory===false||bot.inventoryMode==='legacy';
  const duration=bot.itemUseDurationMs??1750,timeout=bot.itemUseTimeoutMs??Math.max(700,Math.min(1800,(bot.rttMs||0)*2+300));
  for(let attempt=1;attempt<=(bot.itemUseAttempts??2);attempt++){
   if(signal?.aborted)throw Error('停止しました');if(confirmed())break;
   if(bot.name(bot.items[slot])!==item.name)throw Error('使用中のアイテムがサーバーで変更されました');
   state.attempt=attempt;state.phase='using';state.firstUseAt??=Date.now();state.selectDelayMs=state.firstUseAt-state.startedAt;delete state.serverUsingAt;delete state.serverCancelledAt;bot.usingItem=true;
   // Re-sending MobEquipment, even for this same slot, cancels Nukkit's use.
   // Keep one selected stack throughout a timed use and any bounded retry.
   bot.client.queue('inventory_transaction',useItem(bot,'click_air',{x:0,y:0,z:0},-1));
   await pause(duration,true);
   if(state.serverCancelledAt&&!confirmed()){state.phase='cancelled_by_server';bot.usingItem=false;continue;}
   if(!confirmed()){
    if(legacy)bot.client.queue('inventory_transaction',useItem(bot,'click_air',{x:0,y:0,z:0},-1));
    else bot.client.queue('inventory_transaction',{transaction:{legacy:{legacy_request_id:0},transaction_type:'item_release',actions:[],transaction_data:{action_type:'consume',hotbar_slot:slot,held_item:bot.items[slot]||emptyItem(),head_pos:{x:bot.entity.position.x,y:bot.entity.position.y+1.62,z:bot.entity.position.z}}}});
   }
   state.phase='confirming';bot.usingItem=false;
   // Some peers don't echo the consumed stack. Ask for the actual inventory.
   if(legacy&&!confirmed())require('./inventory').requestSync(bot);
   await pause(timeout);if(confirmed())break;
   // A refreshed server effect may precede its inventory echo. Wait for that
   // echo instead of starting a second apple/potion while it is already active.
   if(state.effectObservedAt){if(legacy)require('./inventory').requestSync(bot);await pause(timeout);break;}
  }
  if(!confirmed())throw Error('飲食完了のサーバー更新がありません（タイムアウト）');
  bot.lastItemUse={kind,name:item.name,slot,status:'confirmed',attempts:state.attempt,selectDelayMs:state.selectDelayMs,durationMs:Date.now()-state.startedAt,serverUsingAt:state.serverUsingAt||null,confirmedBy:changed()?'inventory_decrease':'use_item_event',at:Date.now()};return true;
 }catch(e){bot.lastItemUse={kind,name:item.name,status:signal?.aborted?'cancelled':'unconfirmed',attempts:state.attempt,reason:e.message,at:Date.now()};throw e;}
 finally{bot.usingItem=false;bot.lastUsingItem=false;if(bot.handUse===state)bot.handUse=null;}
}
module.exports={consume,protects,busy};
