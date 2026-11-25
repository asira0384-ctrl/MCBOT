'use strict';
const {ProtoDefCompiler}=require('protodef').Compiler;
const cache=new Map();
// Several bundled MovePlayer schemas use a 32-bit varint for actor IDs.
// The gateway sends a full unsigned 64-bit runtime ID. Preserve its wire value.
function correctedProtocol(version){
 if(cache.has(version))return cache.get(version);
 const schema=structuredClone(require('minecraft-data')('bedrock_'+version).protocol);
 const fields=schema.types.packet_move_player?.[1];if(!Array.isArray(fields))throw Error('MovePlayer通信スキーマがありません');
 for(const name of ['runtime_id','ridden_runtime_id']){const f=fields.find(f=>f.name===name);if(!f)throw Error('MovePlayerのIDフィールドがありません');f.type='varint64';}
 const compiler=new ProtoDefCompiler();compiler.addTypesToCompile(schema.types);compiler.addTypes(require('bedrock-protocol/src/datatypes/compiler-minecraft'));
 const proto=compiler.compileProtoDefSync();cache.set(version,proto);return proto;
}
function patchRuntimeIds(client){
 if(!client.serializer||!client.deserializer)return;
 const fixed=correctedProtocol(client.options.version);
 for(const codec of [client.serializer,client.deserializer])for(const ctx of ['readCtx','writeCtx','sizeOfCtx'])codec.proto[ctx].packet_move_player=fixed[ctx].packet_move_player;
 client.runtimeIdSchema='move_player:uint64';
}
module.exports={correctedProtocol,patchRuntimeIds};
