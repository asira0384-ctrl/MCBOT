'use strict';
const cache=new Map(),protocols={'1.26.50':2193,'1.26.51':2193,'1.26.60':2225};
function install(registry,version,hashed){
 const protocol=protocols[version];if(!protocol)return null;
 if(!cache.has(protocol))cache.set(protocol,JSON.parse(require('node:zlib').gunzipSync(require('node:fs').readFileSync(require('node:path').join(__dirname,`../../vendor/bedrock-palettes/${protocol}.json.gz`)))));
 const cached=cache.get(protocol);
 if(require('minecraft-data/package.json').version!==cached.minecraftDataVersion)throw Error('ブロック対応表とminecraft-dataのバージョンが一致しません');
 const ordered=new Map(),hashes=new Map(),reverse=new Map();
 cached.states.forEach((stateId,id)=>{if(stateId<0)return;const local=registry.blocksByStateId[stateId];if(!local)throw Error('ブロック対応表のローカル状態がありません');const entry={...local,stateId};ordered.set(id,entry);hashes.set(cached.hashes[id]>>>0,entry);if(!reverse.has(stateId))reverse.set(stateId,hashed?cached.hashes[id]>>>0:id);});
 registry.blocksByRuntimeId=Object.fromEntries(hashed?hashes:ordered);
 return {ordered,hashes,reverse,info:{protocol,entries:cached.states.length,mapped:ordered.size,sourceCommit:cached.sourceCommit}};
}
module.exports={install};
