'use strict';
const {setTimeout:wait}=require('node:timers/promises');
const {useItem,emptyItem}=require('./protocol');
function busy(){return Object.assign(Error('飲食中の手の操作が完了するまで待機します'),{code:'HAND_BUSY'});}
function protects(bot,type,slot){return !!bot.handUse&&(['hotbar_and_inventory','inventory','hotbar'].includes(type))&&(bot.handUse.slot===undefined||bot.handUse.slot===slot);}
async function consume(bot,item,kind,signal){
 if(bot.handUse)throw busy();if(!item)throw Error('飲食アイテムがありません');
 const state={kind,phase:'selecting',name:item.name,originalSlot:item.slot,startedAt:Date.now()};bot.handUse=state;
 try{
  await bot.equip(item.slot,signal);if(signal?.aborted)throw Error('停止しました');
  const slot=bot.quickBarSlot,held=bot.items[slot],count=held?.count||0;if(bot.name(held)!==item.name)throw Error('手に持った飲食アイテムを確認できません');
  state.slot=slot;state.phase='using';state.startedAt=Date.now();bot.usingItem=true;
  const changed=()=>{const current=bot.items[slot];return !current||bot.name(current)!==item.name||(current.count||0)<count;};
  bot.client.queue('inventory_transaction',useItem(bot,'click_air',{x:0,y:0,z:0},-1));
  // A successful server update may finish immediately (e.g. integration test / instant use).
  // Legacy Nukkit consumes on the second click after >= 30 ticks, not on release-consume.
  const duration=bot.itemUseDurationMs??1700;
  for(let elapsed=0;elapsed<duration&&!changed();elapsed+=50){await wait(Math.min(50,duration-elapsed),undefined,{signal});if(!bot.connected||bot.dead)throw Error('停止・切断しました');}
  if(!changed()){
   if(bot.serverAuthoritativeInventory===false||bot.inventoryMode==='legacy')bot.client.queue('inventory_transaction',useItem(bot,'click_air',{x:0,y:0,z:0},-1));
   else bot.client.queue('inventory_transaction',{transaction:{legacy:{legacy_request_id:0},transaction_type:'item_release',actions:[],transaction_data:{action_type:'consume',hotbar_slot:slot,held_item:bot.items[slot]||emptyItem(),head_pos:{x:bot.entity.position.x,y:bot.entity.position.y+1.62,z:bot.entity.position.z}}}});
  }
  state.phase='confirming';await bot.waitUntil(changed,bot.itemUseTimeoutMs||5000,signal);
  bot.lastItemUse={kind,name:item.name,slot,status:'confirmed',at:Date.now()};return true;
 }catch(e){bot.lastItemUse={kind,name:item.name,status:signal?.aborted?'cancelled':'unconfirmed',reason:e.message,at:Date.now()};throw e;}
 finally{bot.usingItem=false;if(bot.handUse===state)bot.handUse=null;}
}
module.exports={consume,protects,busy};
