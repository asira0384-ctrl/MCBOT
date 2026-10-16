'use strict';
const {setTimeout:wait}=require('node:timers/promises');
const {useItem,emptyItem}=require('./protocol');
function busy(){return Object.assign(Error('飲食中の手の操作が完了するまで待機します'),{code:'HAND_BUSY'});}
function protects(bot,type,slot){return !!bot.handUse&&(['hotbar_and_inventory','inventory','hotbar'].includes(type))&&(bot.handUse.slot===undefined||bot.handUse.slot===slot);}
async function consume(bot,item,kind,signal){
 if(bot.handUse)throw busy();if(!item)throw Error('飲食アイテムがありません');
 const state={kind,phase:'selecting',name:item.name,originalSlot:item.slot,startedAt:Date.now(),attempt:0};bot.handUse=state;bot.straightTimerActive=false;
 try{
  // A pending break / repeated equipment packet cancels eating on Nukkit.
  bot.mining=null;bot.breakAction=null;bot.setControlState('sprint',false);
  await bot.equip(item.slot,signal);if(signal?.aborted)throw Error('停止しました');
  const slot=bot.quickBarSlot,held=bot.items[slot];if(bot.name(held)!==item.name)throw Error('手に持った飲食アイテムを確認できません');
  state.slot=slot;const metadata=held.metadata||0,initialCount=held.count||0;
  const count=()=>bot.items.reduce((n,i)=>n+(i&&bot.name(i)===item.name&&(i.metadata||0)===metadata?(i.count||0):0),0),before=count();
  const changed=()=>{const current=bot.items[slot],name=bot.name(current),transition=!current||kind==='potion'&&name==='glass_bottle'||name===item.name&&(current.metadata||0)===metadata&&(current.count||0)<initialCount;return transition&&count()<before;};
  const pause=async ms=>{for(let elapsed=0;elapsed<ms&&!changed();elapsed+=50){await wait(Math.min(50,ms-elapsed),undefined,{signal});if(!bot.connected||bot.dead)throw Error('停止・切断しました');}};
  const legacy=bot.serverAuthoritativeInventory===false||bot.inventoryMode==='legacy';
  const duration=bot.itemUseDurationMs??1650,timeout=bot.itemUseTimeoutMs??1800;
  for(let attempt=1;attempt<=(bot.itemUseAttempts??2);attempt++){
   if(signal?.aborted)throw Error('停止しました');if(changed())break;
   if(bot.name(bot.items[slot])!==item.name)throw Error('使用中のアイテムがサーバーで変更されました');
   state.attempt=attempt;state.phase='using';state.firstUseAt??=Date.now();state.selectDelayMs=state.firstUseAt-state.startedAt;bot.usingItem=true;
   if(attempt>1)bot.select(slot,true);
   bot.client.queue('inventory_transaction',useItem(bot,'click_air',{x:0,y:0,z:0},-1));
   await pause(duration+(attempt-1)*(bot.itemUseDurationMs===undefined?800:0));
   if(!changed()){
    if(legacy)bot.client.queue('inventory_transaction',useItem(bot,'click_air',{x:0,y:0,z:0},-1));
    else bot.client.queue('inventory_transaction',{transaction:{legacy:{legacy_request_id:0},transaction_type:'item_release',actions:[],transaction_data:{action_type:'consume',hotbar_slot:slot,held_item:bot.items[slot]||emptyItem(),head_pos:{x:bot.entity.position.x,y:bot.entity.position.y+1.62,z:bot.entity.position.z}}}});
   }
   state.phase='confirming';bot.usingItem=false;
   // Some peers don't echo the consumed stack. Ask for the actual inventory.
   if(legacy&&!changed())require('./inventory').requestSync(bot);
   await pause(timeout);if(changed())break;
  }
  if(!changed())throw Error('飲食完了のサーバー更新がありません（タイムアウト）');
  bot.lastItemUse={kind,name:item.name,slot,status:'confirmed',attempts:state.attempt,selectDelayMs:state.selectDelayMs,confirmedBy:'inventory_decrease',at:Date.now()};return true;
 }catch(e){bot.lastItemUse={kind,name:item.name,status:signal?.aborted?'cancelled':'unconfirmed',attempts:state.attempt,reason:e.message,at:Date.now()};throw e;}
 finally{bot.usingItem=false;bot.lastUsingItem=false;if(bot.handUse===state)bot.handUse=null;}
}
module.exports={consume,protects,busy};
