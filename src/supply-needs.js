'use strict';
const equipment=require('./equipment');
const suffixes=['_helmet','_chestplate','_leggings','_boots'];
function strength(bot,raw){return [31,32,33].includes(Number(raw?.metadata))||/strength/i.test(String(bot.nbt(raw)?.Potion||''));}
function desired(bot,name,raw,config={}){
 const list=bot.list(),amount=test=>list.filter(test).reduce((n,i)=>n+i.count,0),targets={crystal:256,gapple:64,strength:12,totem:4,...config.supplyTargets};
 const armor=suffixes.findIndex(s=>name.endsWith(s));
 if(armor>=0){const worn=bot.armor?.[armor],stock=equipment.best(bot,suffixes[armor]),score=equipment.rank(bot,{name,raw});if(!config.supplyUpgradeArmor&&(worn||stock))return 0;return worn&&equipment.rank(bot,{raw:worn})>=score||stock&&equipment.rank(bot,stock)>=score?0:1;}
 let count=amount(i=>i.name===name),cap=0;
 if(name.endsWith('_sword')){const best=equipment.best(bot,'_sword');return best&&equipment.rank(bot,best)>=equipment.rank(bot,{name,raw})?0:1;}
 if(name.endsWith('_pickaxe')){const best=bot.tool();return best&&equipment.rank(bot,best)>=equipment.rank(bot,{name,raw})?0:1;}
 if(name==='elytra')cap=bot.name(bot.armor?.[1])==='elytra'?0:1;
 else if(name==='end_crystal')cap=targets.crystal;
 else if(name==='enchanted_golden_apple')cap=targets.gapple;
 else if(name==='potion'&&strength(bot,raw)){cap=targets.strength;count=amount(i=>i.name==='potion'&&strength(bot,i.raw));}
 else if(/totem/.test(name)){cap=targets.totem;count=amount(i=>/totem/.test(i.name))+(/totem/.test(bot.name(bot.offhand?.[0]))?1:0);}
 else if(name==='shield')cap=bot.name(bot.offhand?.[0])==='shield'?0:1;
 else if(['obsidian','cobblestone','stone','dirt','slime','slime_block'].includes(name))cap=64;
 else if(['piston','sticky_piston','redstone_block','firework_rocket'].includes(name))cap=64;
 return Math.max(0,cap-count);
}
function compatible(a,b){return !!a&&!!b&&a.network_id===b.network_id&&(a.metadata||0)===(b.metadata||0)&&JSON.stringify(a.extra||{})===JSON.stringify(b.extra||{});}
function stackSize(bot,raw){return bot.registry?.items?.[raw.network_id]?.stackSize||(/sword|pickaxe|helmet|chestplate|leggings|boots|elytra|totem|potion|shulker|shield/.test(bot.name(raw))?1:64);}
const priority=name=>name==='enchanted_golden_apple'?0:/totem/.test(name)?1:name==='end_crystal'?2:/sword|helmet|chestplate|leggings|boots/.test(name)?3:name==='potion'?4:5;
async function takeNeeded(bot,window,config={},signal,reserve=1){
 let taken=0;const slots=window.items.map((raw,slot)=>({raw,slot})).filter(v=>v.raw).sort((a,b)=>priority(bot.name(a.raw))-priority(bot.name(b.raw))).map(v=>v.slot);
 for(const slot of slots)for(let round=0;round<64;round++){
  if(signal?.aborted)throw Error('補充を停止しました');const raw=window.items[slot];if(!raw)break;const need=desired(bot,bot.name(raw),raw,config);if(!need)break;
  let destination=bot.items.findIndex((v,n)=>compatible(raw,v)&&v.count<stackSize(bot,raw)&&!require('./item-use').protects(bot,'inventory',n));
  if(destination<0){if(bot.items.filter(v=>!v).length<=reserve)break;destination=bot.items.findIndex(v=>!v);}if(destination<0)break;
  const before=raw.count,amount=Math.min(need,raw.count,stackSize(bot,raw)-(bot.items[destination]?.count||0));await bot.transfer(true,slot,false,destination,amount);const after=window.items[slot]?.count||0;if(after>=before)throw Error('箱から取り出した数を確認できません');taken+=before-after;
 }return taken;
}
module.exports={desired,strength,compatible,stackSize,takeNeeded};
