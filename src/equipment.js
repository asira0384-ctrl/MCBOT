'use strict';
const MATERIAL={leather:1,golden:2,chainmail:3,iron:4,diamond:5,netherite:6};
function rank(bot,item){const name=item.name||bot.name(item.raw||item);const raw=item.raw||item;return (MATERIAL[name.split('_')[0]]||0)*1000+Math.min(100,(bot.nbt(raw)?.ench||[]).reduce((n,e)=>n+Number(e.lvl||0),0))*2-bot.damage(raw)/10000;}
function best(bot,suffix){return bot.list().filter(i=>i.name.endsWith(suffix)).sort((a,b)=>rank(bot,b)-rank(bot,a))[0];}
function strengthPotion(bot){return bot.list().find(i=>i.name==='potion'&&([31,32,33].includes(i.raw.metadata)||/strength/.test(String(bot.nbt(i.raw)?.Potion||''))));}
function wanted(name){return /_sword$|_pickaxe$|_helmet$|_chestplate$|_leggings$|_boots$|^elytra$|totem|^shield$|^enchanted_golden_apple$|^potion$|^firework_rocket$|^end_crystal$|^piston$|^sticky_piston$|^redstone_block$|^obsidian$/.test(name);}
function slotChoices(bot,{pistoncrystal=false}={}){return [[0,best(bot,'_sword')],[1,bot.tool()],[2,bot.find('enchanted_golden_apple')],[3,strengthPotion(bot)],[4,bot.find('totem')||bot.find('totem_of_undying')],[5,bot.find('shield')],...(pistoncrystal?[[6,bot.find('end_crystal')],[7,bot.find('piston')||bot.find('sticky_piston')],[8,bot.find('redstone_block')]]:[[6,bot.find('end_crystal')||bot.find('firework_rocket')],[7,bot.find('obsidian')],...(bot.find('end_crystal')?[[8,bot.find('firework_rocket')]]:[])])].filter(([,item])=>item);}
async function autoSlots(bot,signal,options){
 const needs=()=>slotChoices(bot,options).some(([dest,item])=>item.slot!==dest);if(!needs())return true;
 await bot.openInventory(signal);try{for(let dest=0;dest<9;dest++){if(signal?.aborted)throw Error('停止しました');const choice=slotChoices(bot,options).find(([d])=>d===dest)?.[1];if(choice&&choice.slot!==dest&&!require('./item-use').protects(bot,'inventory',dest)&&!require('./item-use').protects(bot,'inventory',choice.slot))await bot.swap(choice.slot,dest,signal);}}finally{bot.closeContainer();}
 if(!bot.handUse&&!bot.actionHandBusy&&bot.name(bot.items[0]).endsWith('_sword'))bot.select(0);else if(!bot.handUse&&!bot.actionHandBusy&&bot.tool()?.slot<9)bot.select(bot.tool().slot);
 if(slotChoices(bot,options).some(([dest,item])=>item.slot!==dest))return false;return true;
}
async function wear(bot,{armor=true,totem=true,elytra=false},signal){
 const upgrades=[];if(armor)for(const [index,suffix]of ['_helmet','_chestplate','_leggings','_boots'].entries()){const item=index===1&&elytra?bot.find('elytra'):best(bot,suffix),current=bot.armor[index];if(item&&(!current||(elytra&&index===1&&bot.name(current)!=='elytra')||(!(index===1&&elytra)&&rank(bot,item)>rank(bot,{raw:current}))))upgrades.push([item,index]);}
 const held=totem?(bot.find('totem')||bot.find('totem_of_undying')||(!/totem/.test(bot.name(bot.offhand[0]))?bot.find('shield'):null)):null;
 const replaceHand=held&&bot.name(bot.offhand[0])!==held.name;if(!upgrades.length&&!replaceHand)return false;
 await bot.openInventory(signal);try{for(const [item,index]of upgrades)await bot.swapContainer('hotbar_and_inventory',item.slot,'armor',index,signal);
  if(held&&bot.name(bot.offhand[0])!==held.name)await bot.swapContainer('hotbar_and_inventory',held.slot,'offhand',0,signal);
 }finally{bot.closeContainer();}return true;
}
module.exports={best,rank,wanted,slotChoices,autoSlots,wear,strengthPotion};
