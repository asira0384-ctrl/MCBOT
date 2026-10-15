'use strict';
const equipment=require('./equipment');
function desired(bot,name,raw,config={}){
 const armor=['_helmet','_chestplate','_leggings','_boots'].findIndex(s=>name.endsWith(s));
 if(armor>=0){const worn=bot.armor?.[armor],stock=equipment.best(bot,['_helmet','_chestplate','_leggings','_boots'][armor]);return worn&&bot.name(worn).endsWith(['_helmet','_chestplate','_leggings','_boots'][armor])||stock?0:1;}
 const count=bot.list().filter(i=>i.name===name).reduce((n,i)=>n+i.count,0);
 let cap=0;
 if(name.endsWith('_sword'))cap=equipment.best(bot,'_sword')?0:1;
 else if(name.endsWith('_pickaxe'))cap=bot.tool()?0:1;
 else if(name==='elytra')cap=bot.name(bot.armor?.[1])==='elytra'?0:1;
 else if(name==='end_crystal')cap=256;
 else if(name==='enchanted_golden_apple')cap=64;
 else if(name==='potion'&&[31,32,33].includes(raw?.metadata))cap=12;
 else if(/totem/.test(name))cap=4;
 else if(name==='shield')cap=bot.name(bot.offhand?.[0])==='shield'?0:1;
 else if(['obsidian','cobblestone','stone','dirt','slime','slime_block'].includes(name))cap=64;
 else if(['piston','sticky_piston','redstone_block','firework_rocket'].includes(name))cap=64;
 return Math.max(0,cap-count);
}
module.exports={desired};
