'use strict';
const {request,emptyItem}=require('./protocol');
const clone=i=>i?structuredClone(i):null;
const same=(a,b)=>!a?.network_id&&!b?.network_id||!!a&&!!b&&a.network_id===b.network_id&&a.count===b.count&&(a.metadata||0)===(b.metadata||0)&&require('node:util').isDeepStrictEqual(a.extra?.nbt,b.extra?.nbt);
function canonical(type){return ['hotbar','inventory','hotbar_and_inventory'].includes(type)?'inventory':['shulker','level_entity','container'].includes(type)?'container':type;}
function changesWithTypes(bot,changes){return changes.map(c=>({...c,type:c.array===bot.items?'inventory':c.array===bot.armor?'armor':c.array===bot.offhand?'offhand':'container'}));}
function current(bot,c){return bot.array(c.type)?.[c.slot]||null;}
function matches(bot,changes){return changes.every(c=>same(current(bot,c),c.item));}
function windowId(bot,type){return type==='inventory'?0:type==='armor'?120:type==='offhand'?119:typeof bot.window?.id==='number'?bot.window.id:({first:1,last:100}[bot.window?.id]);}
function requestSync(bot){
 if(!bot.connected||bot.ended)return false;bot.inventoryResyncs=(bot.inventoryResyncs||0)+1;
 bot.client.queue('inventory_transaction',{transaction:{legacy:{legacy_request_id:0},transaction_type:'inventory_mismatch',actions:[]}});return true;
}
function serial(bot,fn,signal){const result=(bot.inventoryTail||Promise.resolve()).catch(()=>{}).then(()=>{if(signal?.aborted)throw Error('停止しました');return fn();});bot.inventoryTail=result.catch(()=>{});return result;}
async function openInventory(bot,signal){signal??=bot.operationSignal;
 if(signal?.aborted||!bot.connected)throw Error('停止・切断しました');if(bot.inventoryOpening)return bot.inventoryOpening;if(bot.inventoryOpen)return;
 bot.closeContainer();bot.inventoryOpen=true;bot.inventoryOpenRequests++;bot.inventoryOpenState={phase:'opening',requestedAt:Date.now(),acknowledged:false};
 bot.inventoryOpening=new Promise((resolve,reject)=>{let timer,syncTimer;
  const clean=()=>{clearTimeout(timer);clearTimeout(syncTimer);bot.removeListener('inventoryOpenAcknowledged',ack);bot.removeListener('inventoryContents',contents);bot.removeListener('inventoryClosed',closed);bot.removeListener('end',ended);signal?.removeEventListener('abort',aborted);};
  const fail=e=>{clean();if(bot.connected)try{bot.closeContainer();}catch{}bot.inventoryOpen=false;bot.inventoryOpenState.phase='unconfirmed';reject(e);};
  const finish=()=>{clean();bot.inventoryOpenState.phase='opened';resolve();},ack=()=>{bot.inventoryOpenState.acknowledged=true;bot.inventoryOpenState.confirmedBy='container_open';finish();},contents=wid=>{if(bot.serverAuthoritativeInventory===false&&(wid===0||wid==='inventory')){bot.inventoryOpenState.acknowledged=true;bot.inventoryOpenState.confirmedBy='inventory_content';finish();}},closed=()=>fail(Error('サーバーがインベントリを閉じました')),ended=()=>fail(Error('切断')),aborted=()=>fail(Error('停止しました'));
  bot.on('inventoryOpenAcknowledged',ack);bot.on('inventoryClosed',closed);bot.on('end',ended);signal?.addEventListener('abort',aborted,{once:true});
  bot.on('inventoryContents',contents);
  // Request the screen, then ask legacy peers for actual contents if no open echo arrives.
  timer=setTimeout(()=>fail(Error('インベントリを開くサーバー応答がありません')),bot.inventoryTimeoutMs||5000);
  if(bot.serverAuthoritativeInventory===false||bot.inventoryMode==='legacy')syncTimer=setTimeout(()=>{try{requestSync(bot);}catch(e){fail(e);}},0);
  try{bot.client.queue('interact',{action_id:'open_inventory',target_entity_id:0n,has_position:false});}catch(e){fail(e);}
 });
 try{await bot.inventoryOpening;}finally{bot.inventoryOpening=null;}
}
async function transact(bot,action,changes,signal){signal??=bot.operationSignal;
 if(signal?.aborted||!bot.connected)throw Error('停止・切断しました');if(bot.inventoryOpening)await bot.inventoryOpening;else if(!bot.inventoryOpen&&!bot.window)await bot.openInventory(signal);
 const id=bot.requestId--,epoch=bot.abortVersion,list=changesWithTypes(bot,changes),legacy=bot.inventoryMode==='legacy'||bot.inventoryMode!=='stack'&&bot.serverAuthoritativeInventory===false;
 bot.pendingStackRequest={id,action:action.type_id,mode:legacy?'legacy':'stack',at:Date.now(),source:action.source,destination:action.destination};
 const before=list.map(c=>clone(current(bot,c))),type=legacy?'legacy':'stack';
 try{
  const response=await new Promise((resolve,reject)=>{let timer,refreshTimer;
   const clean=()=>{clearTimeout(timer);clearTimeout(refreshTimer);bot.client.removeListener('item_stack_response',onResponse);bot.removeListener('inventorySnapshot',onSnapshot);bot.removeListener('end',ended);signal?.removeEventListener('abort',aborted);};
   const fail=e=>{clean();reject(e);},done=r=>{clean();resolve(r);},ended=()=>fail(Error('切断')),aborted=()=>fail(Error('停止しました'));
   const onSnapshot=()=>{if(matches(bot,list))done({status:'ok',request_id:id,containers:[],verifiedSnapshot:true});};
   const onResponse=p=>{const r=p.responses?.find(r=>r.request_id===id);if(!r)return;
    if(r.status!=='ok'&&r.status!==0){fail(Error('サーバーがアイテム操作を拒否しました'));return;}
    const proof=new Map();for(const container of r.containers||[]){const t=canonical(typeof container.slot_type==='string'?container.slot_type:container.slot_type?.container_id);for(const slot of container.slots||[])proof.set(`${t}:${slot.slot}`,slot);}
    if(!matches(bot,list)&&!list.every(c=>proof.get(`${c.type}:${c.slot}`)?.count===(c.item?.count||0))){fail(Error('変更したスロットのサーバー確認がありません'));return;}
    done(r);
   };
   timer=setTimeout(()=>fail(Error('アイテム移動のサーバー確認がありません')),bot.inventoryTimeoutMs||7000);
   bot.client.on('item_stack_response',onResponse);bot.on('inventorySnapshot',onSnapshot);bot.on('end',ended);signal?.addEventListener('abort',aborted,{once:true});
   // Legacy success may deliberately exclude the source from slot echoes.
   // Ask for a full authoritative snapshot without closing/reopening or resending the swap.
   if(legacy)refreshTimer=setTimeout(()=>{
    if(signal?.aborted||!bot.connected)return;
    try{requestSync(bot);}catch(e){fail(e);}
   },0);
   try{
    if(legacy){const actions=list.map((c,i)=>{const wid=windowId(bot,c.type);if(wid===undefined)throw Error('コンテナの番号を確認できません');return {source_type:'container',window_id:wid,flags:undefined,slot:c.slot,old_item:before[i]||emptyItem(),new_item:c.item||emptyItem()};});
     if(action.type_id==='drop')actions.push({source_type:'world_interaction',window_id:undefined,flags:0,slot:0,old_item:emptyItem(),new_item:{...before[0],count:action.count}});
     bot.client.queue('inventory_transaction',{transaction:{legacy:{legacy_request_id:0},transaction_type:'normal',actions}});
    }else bot.client.queue('item_stack_request',request(id,[action]));
   }catch(e){fail(e);}
  });
  if(!response.verifiedSnapshot){
   for(const c of list){const array=bot.array(c.type);if(!array)throw Error('コンテナが閉じました');array[c.slot]=clone(c.item);}
   for(const container of response.containers||[]){const t=canonical(typeof container.slot_type==='string'?container.slot_type:container.slot_type?.container_id),array=bot.array(t);if(!array)continue;
    for(const slot of container.slots||[]){if(slot.count===0)array[slot.slot]=null;else if(array[slot.slot]){array[slot.slot].count=slot.count;if(slot.item_stack_id!==undefined)array[slot.slot].stack_id=slot.item_stack_id;if(slot.durability_correction>0)array[slot.slot].metadata=slot.durability_correction;}}
   }
  }
  bot.lastStackResponse={id,status:'ok',mode:type,at:Date.now(),durationMs:Date.now()-(bot.pendingStackRequest?.at||Date.now()),confirmedBy:response.verifiedSnapshot?'inventory_snapshot':'item_stack_response'};
  if(signal?.aborted||epoch!==bot.abortVersion)throw Error('停止しました');return response;
 }catch(e){bot.lastStackResponse={id,status:'failed',mode:type,at:Date.now(),reason:e.message};throw e;}
 finally{if(bot.pendingStackRequest?.id===id)bot.pendingStackRequest=null;}
}
function touches(bot,slot){const request=bot.pendingStackRequest;if(!request)return false;return [request.source,request.destination].some(ref=>ref&&['hotbar','inventory','hotbar_and_inventory'].includes(typeof ref.slot_type==='string'?ref.slot_type:ref.slot_type?.container_id)&&ref.slot===slot);}
module.exports={touches,openInventory,transact,same,canonical,requestSync,serial};
