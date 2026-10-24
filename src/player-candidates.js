'use strict';
const {norm}=require('./util');
function players(manager,target='all'){
 let ids;try{ids=manager.targets(String(target));}catch{ids=[...manager.names.keys()];}
 const result=new Map();for(const id of ids){const bot=manager.workers.get(id)?.bot;if(!bot?.connected)continue;const realm=bot.config?.realm||manager.realm?.(id)||'';
  for(const p of [...(bot.players?.values()||[]),...(bot.actors?.values()||[])]){if(!p.name||p.player===false)continue;const key=realm+':'+norm(p.name);if(!result.has(key))result.set(key,{name:p.name,realm,bot:id});}
 }
 return [...result.values()].sort((a,b)=>a.name.localeCompare(b.name));
}
function autocomplete(manager,target,field,value){let prefix='',query=String(value||'');if(field==='command'){const m=query.match(/^(follow(?:\s+(?:direct|trail|on))?|enemy\s+(?:add|remove)|friend\s+(?:add|remove)|autotp\s+on|tpa)\s+(.*)$/iu);if(!m)return [];prefix=m[1]+' ';query=m[2];}
 return players(manager,target).filter(p=>norm(p.name).startsWith(norm(query))).slice(0,25).map(p=>({name:(p.name+' / '+p.realm).slice(0,100),value:(prefix+p.name).slice(0,100)}));
}
module.exports={players,autocomplete};
