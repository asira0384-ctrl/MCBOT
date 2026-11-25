'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3');
const navigation=require('../../model/movement/navigation/navigation'),{validMotion,remember}=require('../../src/diagnostics/packet-safety'),{adaptInput}=require('../../src/bedrock/protocol');
test('a longer existing ground route takes priority over a scaffold shortcut',()=>{
 const source={blockAt(p){p=new Vec3(p.x,p.y,p.z).floored();const solid=p.y===64&&(p.x===0&&p.z>=0&&p.z<=24||p.x===6&&p.z>=0&&p.z<=24||p.z===24&&p.x>=0&&p.x<=6);return {position:p,name:solid?'stone':'air',solid,isAir:!solid,shapes:solid?[[0,0,0,1,1,1]]:[],diggable:solid,hardness:solid?1:0};}};
 const start=new Vec3(0,65,0),goal=new Vec3(6,65,0),options={radius:32,limit:6000,maxDrop:0};const natural=navigation.groundPath(source,start,goal,options);assert(natural.reached);assert(natural.cost>6*1.8+4);
 const stocked=navigation.groundPath(source,start,goal,{...options,block:{name:'cobblestone'}});assert(stocked.reached);assert.equal(stocked.placements,0);assert.deepEqual(stocked.map(n=>n.position),natural.map(n=>n.position));
});
test('a true missing floor still permits scaffold when no ground path exists',()=>{
 const source={blockAt(p){p=new Vec3(p.x,p.y,p.z).floored();const solid=p.y===64&&p.z===0&&(p.x===0||p.x===4);return {position:p,name:solid?'stone':'air',solid,isAir:!solid,shapes:solid?[[0,0,0,1,1,1]]:[],diggable:solid,hardness:1};}};
 const path=navigation.groundPath(source,new Vec3(0,65,0),new Vec3(4,65,0),{block:{name:'cobblestone'},jumpGaps:false,maxDrop:0,limit:900});assert(path.reached);assert(path.placements>0);
});
test('non-finite motion is rejected before serializer receives it',()=>{
 const good={pitch:0,yaw:0,head_yaw:0,position:{x:0,y:65,z:0},delta:{x:0,y:0,z:0},move_vector:{x:0,y:0}};assert(validMotion(good));
 for(const n of [NaN,Infinity,-Infinity,1e100]){const p=structuredClone(good);p.position.x=n;assert.equal(validMotion(p),false);}assert.equal(validMotion({...good,yaw:NaN}),false);
});
test('conditional payload flags match actual contents on old and modern protocols',()=>{
 for(const version of ['1.21.2','1.26.51']){const registry=require('prismarine-registry')('bedrock_'+version),bot={registry,controlState:{},tick:0};
 const p=adaptInput(bot,{pitch:0,yaw:0,position:{x:0,y:65,z:0},delta:{x:0,y:0,z:0},input_data:{item_interact:true,item_stack_request:true,block_action:true,client_predicted_vehicle:true}});const has=k=>Array.isArray(p.input_data)?p.input_data.includes(k):p.input_data[k];for(const k of ['item_interact','item_stack_request','block_action','client_predicted_vehicle'])assert(!has(k));
 }
});
test('packet diagnostic ring contains metadata only and is bounded',()=>{
 const bot={};for(let i=0;i<40;i++)remember(bot,'player_auth_input',{tick:BigInt(i),secret:'not-for-logs',position:{x:3,y:65,z:2}});assert.equal(bot.recentGameplayPackets.length,24);assert.equal(bot.lastGameplayPacket.tick,'39');assert(!JSON.stringify(bot.recentGameplayPackets).includes('secret'));remember(bot,'login',{token:'SECRET'});assert.equal(bot.recentGameplayPackets.length,24);
});
