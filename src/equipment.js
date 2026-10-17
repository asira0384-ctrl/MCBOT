'use strict';
const MATERIAL={leather:1,golden:2,chainmail:3,iron:4,diamond:5,netherite:6};
function rank(bot,item){const name=item.name||bot.name(item.raw||item);const raw=item.raw||item;return (MATERIAL[name.split('_')[0]]||0)*1000+Math.min(100,(bot.nbt(raw)?.ench||[]).reduce((n,e)=>n+Number(e.lvl||0),0))*2-bot.damage(raw)/10000;}
function best(bot,suffix){return bot.list().filter(i=>i.name.endsWith(suffix)).sort((a,b)=>rank(bot,b)-rank(bot,a))[0];}
function strengthPotion(bot){return bot.list().find(i=>i.name==='potion'&&([31,32,33].includes(i.raw.metadata)||/strength/.test(String(bot.nbt(i.raw)?.Potion||''))));}
function wanted(name){return /_sword$|_pickaxe$|_helmet$|_chestplate$|_leggings$|_boots$|^elytra$|totem|^shield$|^enchanted_golden_apple$|^potion$|^firework_rocket$|^end_crystal$|^piston$|^sticky_piston$|^redstone_block$|^obsidian$/.test(name);}
function equipSlot(bot,name){const pa=!!bot.motion?.runtime?.config.pistoncrystal;const preferred=name.endsWith('_sword')?0:name.endsWith('_pickaxe')?1:/apple/.test(name)?2:name==='potion'?3:/totem/.test(name)?4:name==='end_crystal'?6:/^(sticky_)?piston$/.test(name)?7:name==='redstone_block'?8:name==='obsidian'?(pa?5:7):5;
 for(const slot of [preferred,...[5,8,7,6,4,3].filter(n=>n!==preferred)]){if(require('./inventory').touches(bot,slot)||require('./item-use').protects(bot,'inventory',slot)&&!(bot.handUse.phase==='selecting'&&bot.handUse.name===name))continue;const existing=bot.name(bot.items[slot]);const category=n=>n.endsWith('_sword')?'sword':n.endsWith('_pickaxe')?'pickaxe':/apple/.test(n)?'food':null;const protectedItem=category(existing);if(!existing||!protectedItem||protectedItem===category(name))return slot;}return -1;
}
function slotChoices(bot,{pistoncrystal=false}={}){return [[0,best(bot,'_sword')],[1,bot.tool()],[2,bot.find('enchanted_golden_apple')],[3,strengthPotion(bot)],[4,bot.find('totem')||bot.find('totem_of_undying')],[5,pistoncrystal?bot.find('obsidian'):bot.find('shield')],...(pistoncrystal?[[6,bot.find('end_crystal')],[7,bot.find('piston')||bot.find('sticky_piston')],[8,bot.find('redstone_block')]]:[[6,bot.find('end_crystal')||bot.find('firework_rocket')],[7,bot.find('obsidian')],...(bot.find('end_crystal')?[[8,bot.find('firework_rocket')]]:[])])].filter(([,item])=>item);}
async function autoSlotsNow(bot,signal,options){
 const needs=()=>slotChoices(bot,options).some(([dest,item])=>item.slot!==dest);if(!needs())return true;
 await bot.openInventory(signal);try{for(let dest=0;dest<9;dest++){if(signal?.aborted)throw Error('停止しました');const choice=slotChoices(bot,options).find(([d])=>d===dest)?.[1];if(choice&&choice.slot!==dest&&![dest,choice.slot].some(slot=>require('./item-use').protects(bot,'inventory',slot)||require('./hand').protects(bot,'inventory',slot)))await bot.swap(choice.slot,dest,signal);}}finally{bot.closeContainer();}
 if(!bot.handUse&&!bot.actionHandBusy&&bot.name(bot.items[0]).endsWith('_sword'))bot.select(0);else if(!bot.handUse&&!bot.actionHandBusy&&bot.tool()?.slot<9)bot.select(bot.tool().slot);
 if(slotChoices(bot,options).some(([dest,item])=>item.slot!==dest))return false;return true;
}
function serialEquipment(bot,run){const previous=bot.equipmentTail||Promise.resolve(),task=previous.catch(()=>{}).then(run);bot.equipmentTail=task;return task.finally(()=>{if(bot.equipmentTail===task)bot.equipmentTail=null;});}
function autoSlots(bot,signal,options){return serialEquipment(bot,()=>autoSlotsNow(bot,signal,options));}
function wear(bot,options,signal){return serialEquipment(bot,()=>wearNow(bot,options,signal));}
async function nativeArmor(bot,item,index,signal){
 if(bot.serverAuthoritativeInventory!==false&&bot.inventoryMode!=='legacy'||bot.handUse||bot.actionHandBusy)return false;
 const hand=require('./hand'),lease=hand.claim(bot),selected=bot.quickBarSlot;
 try{await bot.equip(item.slot,signal);await hand.settled(bot,signal);bot.closeContainer();if(signal?.aborted||bot.dead||bot.name(bot.items[bot.quickBarSlot])!==item.name)throw Error('防具の使用を停止しました');
  const held=bot.items[bot.quickBarSlot],slot=bot.quickBarSlot,before=bot.inventoryRevision||0;
  bot.client.queue('inventory_transaction',require('./protocol').useItem(bot,'click_air',{x:0,y:0,z:0},-1));
  await bot.waitUntil(()=>{const worn=bot.armor[index],current=bot.items[slot];return (bot.inventoryRevision||0)>before&&worn?.network_id===held.network_id&&(worn.metadata||0)===(held.metadata||0)&&(current?.network_id!==held.network_id||current?.count<held.count||rank(bot,{raw:current})<rank(bot,item));},bot.armorUseTimeoutMs??900,signal);return true;
 }catch(error){if(signal?.aborted||bot.dead||bot.ended)throw error;return false;}finally{hand.release(bot,lease);if(!bot.handUse&&selected<9&&bot.items[selected])bot.select(selected);}
}
async function wearNow(bot,{armor=true,totem=true,elytra=false},signal){
 let changed=false;const replaceOffhand=()=>{const held=totem?(bot.find('totem')||bot.find('totem_of_undying')||(!/totem/.test(bot.name(bot.offhand[0]))?bot.find('shield'):null)):null;return held&&bot.name(bot.offhand[0])!==held.name?held:null;};
 const held=replaceOffhand();if(held&&!require('./hand').protects(bot,'inventory',held.slot)&&!require('./item-use').protects(bot,'inventory',held.slot)){await bot.openInventory(signal);try{const fresh=replaceOffhand();if(fresh){await bot.swapContainer('hotbar_and_inventory',fresh.slot,'offhand',0,signal);changed=true;}}finally{bot.closeContainer();}}
 if(!armor||bot.handUse||bot.actionHandBusy)return changed;
 for(const [index,suffix]of ['_helmet','_chestplate','_leggings','_boots'].entries()){
  if(totem)changed=await wearNow(bot,{armor:false,totem:true},signal)||changed;
  if(signal?.aborted)throw Error('停止しました');const candidate=()=>index===1&&elytra?bot.find('elytra'):best(bot,suffix);let item=candidate(),current=bot.armor[index];
  if(!item||current&&!(index===1&&elytra&&bot.name(current)!=='elytra')&&(index===1&&elytra||rank(bot,item)<=rank(bot,{raw:current})))continue;
  if(await nativeArmor(bot,item,index,signal)){changed=true;continue;}
  item=candidate();if(!item)continue;await bot.openInventory(signal);try{await bot.swapContainer('hotbar_and_inventory',item.slot,'armor',index,signal);changed=true;}finally{bot.closeContainer();}
 }return changed;
}
module.exports={best,rank,wanted,slotChoices,autoSlots,wear,strengthPotion,equipSlot};
