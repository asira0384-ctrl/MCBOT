'use strict';
// Material/harvest item IDs in the bundled Bedrock data are from several item
// palettes. Resolve by names, never by the server's current network item ID.
const reference=require('minecraft-data')('bedrock_1.17.10');
const tables=Object.fromEntries(Object.entries(reference.materials).map(([material,items])=>[material,Object.fromEntries(Object.entries(items).map(([id,speed])=>[reference.items[id]?.name,speed]).filter(([name])=>name))]));
const caps={wooden:59,stone:131,iron:250,golden:32,diamond:1561,netherite:2031};
const profiles=new WeakMap();
const signature=tools=>Object.keys(tools||{}).filter(id=>tools[id]).sort((a,b)=>Number(a)-Number(b)).join(',');
function harvestSets(registry){
 if(profiles.has(registry))return profiles.get(registry);const set=new Map();
 for(const [anchor,names]of [['stone',['wooden','copper','stone','golden','iron','diamond','netherite']],['iron_ore',['copper','stone','iron','diamond','netherite']],['diamond_ore',['iron','diamond','netherite']],['obsidian',['diamond','netherite']]]){
  const tools=registry.blocksByName[anchor]?.harvestTools;if(tools)set.set(signature(tools),names.map(name=>name+'_pickaxe'));
 }profiles.set(registry,set);return set;
}
function metadata(bot,block){
 const current=bot.registry?.blocksByName?.[block.name]||{},old=reference.blocksByName[block.name],raw=block.material||current.material||old?.material||'default';
 const material=/incorrect_for_/.test(raw)?(old?.material?.includes('mineable/')?old.material:'mineable/pickaxe'):raw;
 const harvest=block.harvestTools||current.harvestTools;let tools=null;
 if(harvest){tools=bot.registry?harvestSets(bot.registry).get(signature(harvest)):null;if(!tools&&old?.harvestTools)tools=Object.keys(old.harvestTools).map(id=>reference.items[id]?.name).filter(Boolean);}
 return {material,rawMaterial:raw,tools,hardness:Number(block.hardness??current.hardness??old?.hardness)};
}
function enchant(bot,raw,id,name){const data=bot.nbt?.(raw)||{};return Math.max(0,...(data.ench||data.Enchantments||[]).filter(e=>Number(e.id)===id||String(e.id).replace(/^minecraft:/,'')===name).map(e=>Number(e.lvl??e.level)||0));}
function multiplier(material,tool){
 let speed=tables[material]?.[tool]||0;for(const part of material.split(';'))speed=Math.max(speed,tables[part]?.[tool]||0);return Math.max(1,speed);
}
function remaining(bot,item){const match=/^(wooden|stone|iron|golden|diamond|netherite)_(pickaxe|axe|shovel|hoe|sword)$/.exec(item.name),cap=match?caps[match[1]]:item.name==='shears'?238:0;return cap-(bot.damage?.(item.raw)||0);}
function estimate(bot,block,tool){
 const meta=metadata(bot,block);if(block.diggable===false||!Number.isFinite(meta.hardness)||meta.hardness<0)return {ms:Infinity,...meta,reason:'破壊できないブロック'};
 const name=tool?.name||'',harvestable=!meta.tools||meta.tools.includes(name),base=multiplier(meta.material,name),efficiency=base>1?enchant(bot,tool?.raw,15,'efficiency'):0;
 let speed=base+(efficiency?efficiency*efficiency+1:0);const effect=id=>{const e=bot.effects?.get(id);return e&&(!e.expires||e.expires>Date.now())?(Number(e.amplifier)||0)+1:0;};
 const haste=Math.max(effect(3),effect(26)),fatigue=effect(4);speed*=1+.2*haste;if(fatigue)speed*=[1,.3,.09,.0027,.00081][Math.min(4,fatigue)];
 const eye=bot.entity?.position?.offset(0,1.62,0),water=eye&&/^(flowing_)?water$/.test(bot.blockAt?.(eye)?.name),aqua=enchant(bot,bot.armor?.[0],6,'aqua_affinity');if(water&&!aqua)speed/=5;
 const airborne=bot.entity?.onGround===false;if(airborne)speed/=5;const ticks=meta.hardness===0?0:Math.ceil((harvestable?30:100)*meta.hardness/speed);
 return {ms:Math.max(50,ticks*50+100),...meta,tool:name,harvestable,baseSpeed:base,effectiveSpeed:speed,efficiency,haste,fatigue,water:!!water,airborne};
}
function choose(bot,block){
 return (bot.list?.()||[]).filter(item=>remaining(bot,item)>10).map(item=>({item,profile:estimate(bot,block,item)})).filter(row=>row.profile.harvestable&&Number.isFinite(row.profile.ms)).sort((a,b)=>a.profile.ms-b.profile.ms||remaining(bot,b.item)-remaining(bot,a.item))[0]?.item||null;
}
module.exports={metadata,estimate,choose,remaining};
