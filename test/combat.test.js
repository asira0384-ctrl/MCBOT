'use strict';
const test=require('node:test'),assert=require('node:assert/strict');const {Vec3}=require('vec3');const {inHole,buried,ownClear,CrystalCombat}=require('../src/combat');
function fixture(){const blocks=new Map(),key=p=>`${Math.floor(p.x)},${Math.floor(p.y)},${Math.floor(p.z)}`,b={health:20,config:{host:'2b2e.org',port:19132},dimensionId:0,entity:{position:new Vec3(0,64,0)},actors:new Map(),blockAt:p=>blocks.get(key(p))||{name:'air',position:p.floored(),solid:false,isAir:true},reach:()=>true,visible:()=>true};const r={bot:b,manager:{workers:new Map()},config:{crystalaura:true,pistoncrystal:true}};return {b,r,blocks,set:(p,name)=>blocks.set(key(p),{name,position:p.floored(),solid:true,boundingBox:'block',stateId:1})};}
test('hole and burrow detection require received floor and all four solid walls',()=>{const {b,set}=fixture(),enemy={position:new Vec3(4.5,64,.5)};assert.equal(inHole(b,enemy),false);const p=enemy.position.floored();set(p.offset(0,-1,0),'bedrock');for(const [x,z]of [[1,0],[-1,0],[0,1],[0,-1]])set(p.offset(x,0,z),'obsidian');assert.equal(inHole(b,enemy),true);assert.equal(buried(b,enemy),false);set(p,'obsidian');assert.equal(buried(b,enemy),true);});
test('Crystal safety blocks own close explosions and same-server nearby bots but does not mix servers',()=>{const {b,r}=fixture();assert.equal(ownClear(r,new Vec3(1,64,0)),false);const point=new Vec3(4,64,0);assert.equal(ownClear(r,point),true);const ally={connected:true,dimensionId:0,config:{...b.config},entity:{position:new Vec3(5,64,0)}};r.manager.workers.set(2,{bot:ally});assert.equal(ownClear(r,point),false);ally.config.host='ign.example';assert.equal(ownClear(r,point),true);b.health=8;assert.equal(ownClear(r,point),false);});
test('PA refuses a wrong-facing piston and removes its own power when the opponent leaves the hole',async()=>{const {b,r,set}=fixture(),c=new CrystalCombat(r),enemy={id:10n,position:new Vec3(4.5,64,.5)},p=enemy.position.floored();set(p.offset(0,-1,0),'bedrock');for(const [x,z]of [[1,0],[-1,0],[0,1],[0,-1]])set(p.offset(x,0,z),'obsidian');const pistonPos=p.offset(2,1,0),powerPos=pistonPos.offset(0,0,-1);set(pistonPos,'piston');b.blockAt(pistonPos).properties={facing_direction:5};c.piston={enemyId:'10',facing:4,pistonPos,powerPos,power:false};assert.equal(await c.tick(enemy),false);assert.match(c.state,/方向|向いて/);c.piston.power=true;set(powerPos,'redstone_block');let removed;b.tool=()=>({name:'diamond_pickaxe'});b.dig=async block=>{removed=block.position;};await c.tick({id:10n,position:new Vec3(9,64,0)});assert.deepEqual(removed,powerPos);assert.equal(c.piston,null);});
function pistonAdapter(t,options={}){
 const {adapter}=require('./helpers/adapter'),{key}=require('../src/util'),{b,c,item,packets}=adapter(t);
 const blocks=new Map(),trace=[],enemy={id:10n,name:'Enemy',player:true,dimension:0,position:new Vec3(4.5,64,.5)},hole=enemy.position.floored();
 const set=(p,name,properties={})=>{if(options.wirePiston&&name==='piston'){const Block=require('prismarine-block')(b.registry),entry=b.registry.blocksByName.piston;let local;for(let id=entry.minStateId;id<=entry.maxStateId;id++)if(Number(Block.fromStateId(id).getProperties().facing_direction)===properties.facing_direction){local=id;break;}c.emit('update_block',{position:p,block_runtime_id:b.worldMirror.wireIds.get(local)??local,layer:0});return;}blocks.set(key(p),{name,position:p.floored(),solid:true,boundingBox:'block',stateId:1,properties});};
 b.blockAt=p=>options.wirePiston&&b.worldMirror.overrides.has(key(p))?b.worldMirror.get(p):blocks.get(key(p))||{name:'air',position:p.floored(),solid:false,isAir:true,boundingBox:'empty',stateId:0};
 b.entity.position=new Vec3(.5,64,.5);b.health=20;b.reach=()=>true;b.visible=()=>true;b.actors.set('10',enemy);
 set(hole.offset(0,-1,0),'bedrock');for(const [x,z]of [[1,0],[-1,0],[0,1],[0,-1]])set(hole.offset(x,0,z),'obsidian');
 const support=hole.offset(2,0,0);set(support.offset(0,-1,0),'stone');if(options.support)set(support,options.support);
 if(!options.noObsidian)b.items[5]=item('obsidian',50);b.items[6]=item('end_crystal',60);b.items[7]=item('piston',70);b.items[8]=item('redstone_block',80);
 const runtime={bot:b,manager:{workers:new Map(),store:{data:{enemies:[{name:enemy.name}]}}},config:{crystalaura:true,pistoncrystal:true}},combat=new CrystalCombat(runtime);
 const original=c.queue,faces=[[0,-1,0],[0,1,0],[0,0,-1],[0,0,1],[-1,0,0],[1,0,0]];
 c.queue=(name,params)=>{
  original(name,params);
  if(name!=='inventory_transaction')return;const transaction=params.transaction,data=transaction.transaction_data;
  if(transaction.transaction_type==='item_use_on_entity'){trace.push('attack:'+String(data.entity_runtime_id));return;}
  if(transaction.transaction_type!=='item_use'||data.action_type!=='click_block')return;
  const held=b.name(data.held_item),p=new Vec3(data.block_position.x,data.block_position.y,data.block_position.z);trace.push(held);
  queueMicrotask(()=>{
   if(held==='end_crystal'){
    options.onCrystal?.(enemy);
    if(options.confirmCrystal!==false){c.emit('add_entity',{runtime_id:100n,unique_id:100n,entity_type:'minecraft:ender_crystal',position:p.offset(.5,1,.5)});trace.push('ack:crystal');}
   }else{
    const [x,y,z]=faces[data.face];set(p.offset(x,y,z),held,held==='piston'?{facing_direction:options.facing??4}:{});trace.push('ack:'+held);
    if(held==='redstone_block'&&options.push!==false){c.emit('move_entity',{runtime_entity_id:100n,position:hole.offset(.5,1,.5)});trace.push('ack:push');}
   }
  });
 };
 return {b,c,packets,trace,combat,enemy,hole,support};
}
test('PA builds missing obsidian below the piston, then places piston/crystal/power in one operation',async t=>{
 const {b,trace,combat,enemy,hole,support}=pistonAdapter(t);
 assert.equal(await combat.tick(enemy),true);
 assert.deepEqual(trace.filter(x=>!x.startsWith('ack:')&&!x.startsWith('attack:')),['obsidian','piston','end_crystal','redstone_block']);
 assert.equal(b.blockAt(support).name,'obsidian');assert.deepEqual(combat.piston.pistonPos,support.offset(0,1,0));
 assert.deepEqual(combat.piston.base.position,hole.offset(1,0,0));
 assert(trace.indexOf('ack:piston')<trace.indexOf('end_crystal'));assert(trace.indexOf('ack:crystal')<trace.indexOf('redstone_block'));
 assert(trace.indexOf('ack:push')<trace.indexOf('attack:100'));assert.equal(combat.piston.power,true);
});
test('PA accepts an existing stone floor without obsidian and starts directly with the piston',async t=>{
 const {b,trace,combat,enemy,support}=pistonAdapter(t,{support:'stone',noObsidian:true});
 assert.equal(await combat.tick(enemy),true);
 assert.deepEqual(trace.filter(x=>!x.startsWith('ack:')&&!x.startsWith('attack:')),['piston','end_crystal','redstone_block']);
 assert.equal(b.blockAt(support).name,'stone');assert(!trace.includes('obsidian'));
});
test('PA never powers a piston when the server has not confirmed crystal placement',async t=>{
 const {trace,combat,enemy}=pistonAdapter(t,{support:'obsidian',confirmCrystal:false});
 assert.equal(await combat.tick(enemy),false);assert.match(combat.state,/設置が未確認/);
 assert.deepEqual(trace.filter(x=>!x.startsWith('ack:')),['piston','end_crystal']);assert.equal(combat.piston.power,false);
});
test('PA stops before redstone when the opponent leaves during crystal confirmation',async t=>{
 const {trace,combat,enemy}=pistonAdapter(t,{support:'obsidian',onCrystal:enemy=>{enemy.position=new Vec3(9.5,64,.5);}});
 assert.equal(await combat.tick(enemy),false);assert.equal(combat.piston,null);
 assert(!trace.includes('redstone_block'));assert(!trace.some(x=>x.startsWith('attack:')));
});
test('PA checks the received piston direction before sending crystal or power',async t=>{
 const {trace,combat,enemy}=pistonAdapter(t,{support:'obsidian',facing:5});
 assert.equal(await combat.tick(enemy),false);assert.match(combat.state,/向いていません/);
 assert.deepEqual(trace,['piston','ack:piston']);
});
test('PA waits for its own crystal to be pushed and ignores another crystal in the hole',async t=>{
 const {c,trace,combat,enemy,hole}=pistonAdapter(t,{support:'obsidian',push:false});
 c.emit('add_entity',{runtime_id:200n,unique_id:200n,entity_type:'minecraft:ender_crystal',position:hole.offset(.5,1,.5)});
 assert.equal(await combat.tick(enemy),true);assert.match(combat.state,/押し込みが未確認/);
 assert.equal(combat.piston.crystalId,'100');assert(!trace.some(x=>x.startsWith('attack:')));
 c.emit('move_entity',{runtime_entity_id:100n,position:hole.offset(.5,1,.5)});
 assert.equal(await combat.tick(enemy),true);assert(trace.includes('attack:100'));assert(!trace.includes('attack:200'));
});

test('PA continues to crystal and power using the actual live piston update packet instead of injected properties',async t=>{
 const {b,combat,enemy,trace}=pistonAdapter(t,{support:'obsidian',wirePiston:true});assert(await combat.tick(enemy));assert.equal(Number(b.blockAt(combat.piston.pistonPos).properties.facing_direction),4);assert(trace.includes('redstone_block'));assert(trace.includes('attack:100'));assert.equal(combat.piston.error,undefined);
});
