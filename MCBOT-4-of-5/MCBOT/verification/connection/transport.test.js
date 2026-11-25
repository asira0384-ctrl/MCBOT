'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const dgram=require('node:dgram');const bedrock=require('bedrock-protocol');
async function freePort(){const s=dgram.createSocket('udp4');await new Promise((resolve,reject)=>{s.once('error',reject);s.bind(0,'127.0.0.1',resolve);});const p=s.address().port;await new Promise(resolve=>s.close(resolve));return p;}
for(const version of ['1.26.51','1.26.60'])test(`Native RakNet real UDP discovery and Bedrock handshake match ${version}`, {timeout:30000},async t=>{
 const port=await freePort();const server=new bedrock.Server({host:'127.0.0.1',port,version,offline:true,raknetBackend:'raknet-native',transport:'raknet',maxPlayers:2});
 let client;t.after(async()=>{client?.close();await server.close();});
 let peer;const errors=[];server.on('error',e=>errors.push(e));server.on('connect',p=>{peer=p;p.on('error',e=>errors.push(e));});require('../../src/bedrock/runtime-schema').patchRuntimeIds(server);
 await server.listen();const pong=await bedrock.ping({host:'127.0.0.1',port,transport:'raknet',timeout:3000});assert.equal(pong.protocol,String(require('bedrock-protocol/src/options').Versions[version]));
 client=bedrock.createClient({host:'127.0.0.1',port,offline:true,username:'LocalTransportTest',raknetBackend:'raknet-native',transport:'raknet',conLog:()=>{},connectTimeout:5000});client.prependOnceListener('connect_allowed',()=>require('../../src/bedrock/runtime-schema').patchRuntimeIds(client));
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('local Bedrock handshake timed out')),8000);client.once('join',()=>{clearTimeout(timer);resolve();});client.once('error',e=>{clearTimeout(timer);reject(e);});});
 assert.equal(client.runtimeIdSchema,'move_player:uint64');assert.equal(client.options.version,version);assert.equal(errors.length,0);
 // Replay the gateway's real 63-bit teleport over encrypted UDP, then verify
 // the server receives our response (not merely that a codec round-trips).
 const EventEmitter=require('node:events'),{Vec3}=require('vec3');const bot=new EventEmitter();bot.client=client;bot._runtimeEntityId=9223372036854775807n;bot.registry=require('prismarine-registry')('bedrock_'+version);bot.entity={position:new Vec3(128,68.38,128),velocity:new Vec3(0,0,0)};bot.connected=true;bot.passivePhysics=true;bot.controlState={};
 require('../../vendor/bedrockflayer/lib/physics/engine')(bot);require('../../src/bedrock/session').installSession(bot);
 const ack=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('teleport response never reached local server')),3000);peer.once('player_auth_input',p=>{clearTimeout(timer);resolve(p);});});
 client.once('move_player',()=>client.queue('player_auth_input',require('../../src/bedrock/protocol').adaptInput(bot,{pitch:0,yaw:0,head_yaw:0,position:{x:128.5,y:2.13,z:128.5},move_vector:{x:0,y:0},delta:{x:0,y:0,z:0},input_data:0n,tick:11n})));
 peer.write('move_player',{runtime_id:bot._runtimeEntityId,position:{x:128.5,y:2.13,z:128.5},pitch:0,yaw:0,head_yaw:0,mode:'teleport',on_ground:true,ridden_runtime_id:0n,teleport:{cause:'command',source_entity_type:'player'},tick:10n});
 const received=await ack;assert(received.input_data.includes('handled_teleport'));assert.equal(bot._runtimeEntityId,9223372036854775807n);assert.equal(bot.entity.position.x,128.5);assert.equal(bot.sessionResponses.handled_teleport,1);assert.equal(errors.length,0);
 // Use the actual adapter and equipment module over the encrypted connection.
 // The local server acknowledges opening the inventory and the exact offhand
 // swap; the bot must wait for both responses before reporting success.
 const fs=require('node:fs'),os=require('node:os');const dir=fs.mkdtempSync(os.tmpdir()+'/asira-wire-');const original=bedrock.createClient;let inventoryBot;
 bedrock.createClient=()=>client;try{inventoryBot=new(require('../../src/bedrock/bedrock').BedrockBot)({id:1,name:'LocalTransportTest',host:'127.0.0.1',port,authDir:dir},()=>{});}finally{bedrock.createClient=original;}
 t.after(()=>{inventoryBot.disconnect();fs.rmSync(dir,{recursive:true,force:true});});inventoryBot.on('error',e=>errors.push(e));
 client.startGameData={runtime_entity_id:9223372036854775807n,player_position:{x:0,y:65.62,z:0},rotation:{x:0,y:0},dimension:0,server_authoritative_inventory:true};client.emit('start_game',client.startGameData);inventoryBot.physicsEnabled=false;client.emit('spawn');
 // Announce client-request terrain and check the real server sees distinct Y offsets.
 const terrainRequest=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('subchunk request did not reach the local server')),2000);peer.once('subchunk_request',p=>{clearTimeout(timer);resolve(p);});});
 await inventoryBot.worldMirror.chunk({x:-3,z:2,sub_chunk_count:0xffffffff,cache_enabled:false,payload:Buffer.alloc(0)});const requestedTerrain=await terrainRequest;assert.deepEqual(requestedTerrain.origin,{x:-3,y:0,z:2});assert.deepEqual(requestedTerrain.requests.map(r=>r.y),[2,3,4,5,6]);assert.equal(new Set(requestedTerrain.requests.map(r=>r.y)).size,5);
 const raw={...require('../../src/bedrock/protocol').emptyItem(),network_id:inventoryBot.registry.itemsByName.totem_of_undying.id,count:1,has_stack_id:true,stack_id:15};inventoryBot.items[12]=raw;
 let opened=false,requested=false;peer.on('interact',p=>{assert.equal(p.target_entity_id,0n);opened=true;peer.write('container_open',{window_id:'inventory',window_type:'inventory',coordinates:{x:0,y:64,z:0},runtime_entity_id:0n});});
 peer.on('item_stack_request',p=>{assert(opened);requested=true;const req=p.requests[0],a=req.actions[0];assert.equal(a.source.stack_id,15);assert.equal(a.destination.slot_type.container_id,'offhand');peer.write('item_stack_response',{responses:[require('../helpers/stack-response').stackResponse(inventoryBot,req)]});});
 await require('../../model/inventory/equipment/equipment').wear(inventoryBot,{armor:false,totem:true});assert(requested);assert.equal(inventoryBot.name(inventoryBot.offhand[0]),'totem_of_undying');assert.equal(inventoryBot.items[12],null);assert.equal(inventoryBot.inventoryOpenState.acknowledged,true);assert.equal(errors.length,0);
 // Real encrypted mining frames must obey both independent authority flags.
 // A legacy-inventory peer rejects embedded MineBlock; a stack peer requires it.
 const beforeMiningBlockAt=inventoryBot.blockAt,beforeBreakTime=inventoryBot.breakTime,position=new Vec3(1,64,0),world=inventoryBot.worldMirror;
 const airId=world.networkPalette.reverse.get(inventoryBot.registry.blocksByName.air.defaultState),obsidianId=world.networkPalette.reverse.get(inventoryBot.registry.blocksByName.obsidian.defaultState);
 inventoryBot.items[1]={...require('../../src/bedrock/protocol').emptyItem(),network_id:inventoryBot.registry.itemsByName.netherite_pickaxe.id,count:1,has_stack_id:true,stack_id:21};
 inventoryBot.blockAt=p=>p.floored().equals(position)?world.get(p):{name:'air',position:p.floored(),solid:false,isAir:true};inventoryBot.breakTime=()=>100;inventoryBot.serverBreak=true;let miningTick=20n;
 const miningTimer=setInterval(()=>client.queue('player_auth_input',{pitch:0,yaw:0,head_yaw:0,position:inventoryBot.entity.position.offset(0,1.62,0),delta:{x:0,y:0,z:0},move_vector:{x:0,y:0},input_data:0n,tick:miningTick++}),50);
 try{for(const inventory of [false,true]){
  inventoryBot.serverAuthoritativeInventory=inventory;world.update({position,block_runtime_id:obsidianId});let predictions=0;
  const onPrediction=p=>{const a=p.block_action?.find(a=>a.action==='predict_break');if(!a)return;predictions++;assert.equal(p.input_data.includes('item_stack_request'),inventory);if(inventory){assert.equal(p.item_stack_request.actions[0].network_id,21);assert.equal(p.item_stack_request.actions[0].legacy_type_id,11);}else assert.equal(p.item_stack_request,undefined);peer.write('update_block',{position,block_runtime_id:airId,flags:3,layer:0});};
  peer.on('player_auth_input',onPrediction);try{await inventoryBot.dig(inventoryBot.blockAt(position),undefined,undefined,{timeout:3000});assert.equal(predictions,1);assert(inventoryBot.digState.confirmed);assert(inventoryBot.connected);assert.equal(client._closed,false);}finally{peer.removeListener('player_auth_input',onPrediction);}
 }}finally{clearInterval(miningTimer);inventoryBot.blockAt=beforeMiningBlockAt;inventoryBot.breakTime=beforeBreakTime;}assert.equal(errors.length,0);
 const crystalAdded=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('crystal entity was not received')),2000);client.once('add_entity',()=>{clearTimeout(timer);resolve();});});peer.write('add_entity',{unique_id:100n,runtime_id:100n,entity_type:'minecraft:ender_crystal',position:{x:4,y:64,z:0},velocity:{x:0,y:0,z:0},pitch:0,yaw:0,head_yaw:0,body_yaw:0,attributes:[],metadata:[],properties:{ints:[],floats:[]},links:[]});await crystalAdded;assert(inventoryBot.actors.has('100'));inventoryBot.health=20;const priorBlockAt=inventoryBot.blockAt;inventoryBot.blockAt=p=>({name:'air',solid:false,position:new Vec3(p.x,p.y,p.z)});const combat=new(require('../../model/combat/crystalaura/combat').CrystalCombat)({bot:inventoryBot,manager:{workers:new Map()},config:{crystalaura:true,pistoncrystal:false}});const attackReceived=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('crystal attack was not received')),2000);peer.once('inventory_transaction',p=>{clearTimeout(timer);resolve(p);});});await combat.tick({id:7n,position:new Vec3(5,64,0)});assert.equal((await attackReceived).transaction.transaction_data.entity_runtime_id,100n);inventoryBot.blockAt=priorBlockAt;
 // Model the Nukkit start/complete use state over the actual encrypted wire.
 // Equipment changes cancel the server timer; opening inventory does not.
 inventoryBot.serverAuthoritativeInventory=false;
 const itemRaw=(name,count=1,metadata=0)=>({...require('../../src/bedrock/protocol').emptyItem(),network_id:inventoryBot.registry.itemsByName[name].id,count,metadata,has_stack_id:true,stack_id:1});
 inventoryBot.items[2]=itemRaw('enchanted_golden_apple',3);inventoryBot.items[3]=itemRaw('potion',1,33);
 let useStarted=0,selected=0,consumed=0;
 const onEquipment=p=>{selected=p.selected_slot;useStarted=0;};
 const onUse=p=>{const tx=p.transaction,d=tx.transaction_data;if(tx.transaction_type!=='item_use'||d.action_type!=='click_air')return;
  assert.equal(d.hotbar_slot,selected);if(!useStarted){useStarted=Date.now();return;}
  assert(Date.now()-useStarted>=1500);useStarted=0;consumed++;
  const current=inventoryBot.items[selected],name=inventoryBot.name(current),next=name==='potion'?itemRaw('glass_bottle'):itemRaw(name,current.count-1);
  peer.write('inventory_slot',{window_id:'inventory',slot:selected,container:{container_id:'inventory'},storage_item:require('../../src/bedrock/protocol').emptyItem(),item:next});
 };
 peer.on('mob_equipment',onEquipment);peer.on('inventory_transaction',onUse);
 const eating=inventoryBot.eat();while(!inventoryBot.usingItem)await new Promise(resolve=>setTimeout(resolve,10));await inventoryBot.openInventory();await eating;
 assert.equal(inventoryBot.lastItemUse.status,'confirmed');assert.equal(inventoryBot.count('enchanted_golden_apple'),2);
 await inventoryBot.drink(inventoryBot.find('potion'));assert.equal(inventoryBot.lastItemUse.status,'confirmed');assert.equal(inventoryBot.name(inventoryBot.items[3]),'glass_bottle');assert.equal(consumed,2);
 peer.removeListener('mob_equipment',onEquipment);peer.removeListener('inventory_transaction',onUse);inventoryBot.closeContainer();combat.destroy();
 const publicChat=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('public message was not received')),2000);peer.once('text',p=>{clearTimeout(timer);resolve(p);});});inventoryBot.chat('こんにちは  world');const publicReceived=await publicChat;assert.equal(publicReceived.category,'authored');assert.equal(publicReceived.message,'こんにちは  world');
 const greetings=new(require('../../model/chat/greetings/greetings').FleetGreetings)({names:new Map([[1,'LocalTransportTest']]),workers:new Map([[1,{bot:inventoryBot}]])},{env:{GREET_TARGET_ID:'Asira'},choose:()=>0});inventoryBot.on('chat',p=>greetings.handle(1,p));
 const greeted=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('greeting was not received')),7000);peer.once('text',p=>{clearTimeout(timer);resolve(p);});});peer.write('text',{type:'raw',category:'message_only',needs_translation:false,message:'[+] Asira',xuid:'',platform_chat_id:'',has_filtered_message:false});const greetingReceived=await greeted;assert.equal(greetingReceived.category,'authored');assert.match(greetingReceived.message,/^@Asira \| Yo! \| [A-Za-z0-9]{10}$/);
 const tell=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('tell command was not received')),2000);peer.once('command_request',p=>{clearTimeout(timer);resolve(p);});});inventoryBot.whisper('xMr hagi jr','hello  world');assert.equal((await tell).command,'/tell "xMr hagi jr" hello  world');
 await inventoryBot.logout('バイバイ！');assert.equal(inventoryBot.connected,false);assert.equal(inventoryBot.chatQueue.pending.length,0);
});
