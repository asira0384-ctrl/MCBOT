'use strict';
const {CURRENT_VERSION,Versions}=require('bedrock-protocol/src/options');
function connectionVersion(id,env=process.env,realm){const ign=realm?realm==='ign':id===11;const explicit=(ign?env.IGN_VERSION:env.MC_VERSION)?.trim();if(explicit){if(!Object.hasOwn(Versions,explicit))throw Error(`${ign?'IGN_VERSION':'MC_VERSION'}の対応版がありません: ${explicit}`);return explicit;}return ign?CURRENT_VERSION:undefined;}
module.exports={connectionVersion};
