'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const {createSerializer,createDeserializer}=require('bedrock-protocol/src/transforms/serializer');const {useItem,request,slotRef,adaptInput,legacyMove}=require('../src/protocol');const {Vec3}=require('vec3');
for(const version of ['1.21.2','1.26.51'])test(`packets round trip against official Bedrock ${version} schema`,()=>{const registry=require('prismarine-registry')(`bedrock_${version}`);const bot={registry,quickBarSlot:0,items:[require('../src/protocol').emptyItem()],entity:{position:new Vec3(0,64,0)},controlState:{jump:false,sneak:false}};const s=createSerializer(version),d=createDeserializer(version);require('../src/runtime-schema').patchRuntimeIds({options:{version},serializer:s,deserializer:d});const packets=[
 ['inventory_transaction',useItem(bot,'click_air',{x:0,y:0,z:0},-1)],
 ['item_stack_request',request(-1,[{type_id:'swap',source:slotRef('hotbar_and_inventory',9,{stack_id:1}),destination:slotRef('hotbar_and_inventory',0,null)}])],
 ['item_stack_request',request(-2,[{type_id:'drop',count:64,source:slotRef('hotbar_and_inventory',0,{stack_id:1}),randomly:false}])],
 ['item_stack_request',request(-3,[{type_id:'take',count:1,source:slotRef('level_entity',0,{stack_id:1}),destination:slotRef('hotbar_and_inventory',1,null)}])],
 ['player_auth_input',adaptInput(bot,{pitch:0,yaw:0,position:{x:0,y:65.62,z:0},move_vector:{x:0,y:0},analogue_move_vector:{x:0,y:0},head_yaw:0,input_data:0n,tick:1n,delta:{x:0,y:0,z:0}})],
 ['respawn',{position:{x:0,y:65.62,z:0},state:2,runtime_entity_id:1n}],
 ['subchunk_request',{dimension:0,origin:{x:0,y:0,z:0},requests:[{dx:0,dy:4,dz:0}]}]
 ];for(const[name,params]of packets){const b=s.createPacketBuffer({name,params});assert.equal(d.parsePacketBuffer(b).data.name,name,name);}
 bot.breakAction={action:'crack_break',position:{x:1,y:64,z:0},face:1};const base=packets.find(p=>p[0]==='player_auth_input')[1];bot._runtimeEntityId=1n;const move=legacyMove(bot,base);assert.equal(d.parsePacketBuffer(s.createPacketBuffer({name:'move_player',params:move})).data.params.mode,'normal');const p=adaptInput(bot,base);const read=d.parsePacketBuffer(s.createPacketBuffer({name:'player_auth_input',params:p})).data.params;assert.equal(read.block_action[0].action,'crack_break');assert(Array.isArray(read.input_data)?read.input_data.includes('block_breaking_delay_enabled'):read.input_data.block_breaking_delay_enabled);
});
