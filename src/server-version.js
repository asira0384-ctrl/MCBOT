'use strict';
const {CURRENT_VERSION,Versions}=require('bedrock-protocol/src/options');
function connectionVersion(id,env=process.env){const explicit=(id===11?env.IGN_VERSION:env.MC_VERSION)?.trim();if(explicit){if(!Object.hasOwn(Versions,explicit))throw Error(`${id===11?'IGN_VERSION':'MC_VERSION'}の対応版がありません: ${explicit}`);return explicit;}return id===11?CURRENT_VERSION:undefined;}
module.exports={connectionVersion};
