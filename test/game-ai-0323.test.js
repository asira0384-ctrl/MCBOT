'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{handle}=require('../modules/chat/ai/game-ai');
test('shared chat replies once, includes real bot and requester, and does not authorize training from raw display names',async()=>{
 const answers=[],m={store:{data:{gameAI:{mode:'all',allow:[],notes:[]}},authorized:()=>true,save:()=>{}},workers:new Map()},w={id:3,mode:'running',running:true,miner:{state:'Y84'},bot:{connected:true,config:{host:'test'},players:new Map([['alice',{xuid:'12345'}]]),chat:s=>answers.push(s)}};m.workers.set(3,w);
 for(let i=0;i<2;i++)await handle(m,w,{type:'raw'}, {name:'Alice',message:'!ai いまなにしてる？'});assert.deepEqual(answers,['[Bot3][IGNGPT] @Alice 採掘中。Y84']);
 m.aiSeen.clear();await handle(m,w,{type:'raw'}, {name:'Alice',message:'!aig 限定'});assert.equal(m.store.data.gameAI.mode,'all');
 await handle(m,w,{type:'chat',source_name:'Alice',xuid:'12345'}, {name:'Alice',message:'!aig 限定'});assert.equal(m.store.data.gameAI.mode,'list');
});
test('15 miners select distinct blocks on the same highest layer while peers approach',t=>{
 const {fixture}=require('./helpers/mining-world'),{Vec3}=require('vec3'),fleet=[],targets=new Set();
 for(let i=0;i<15;i++){const f=fixture(t),w=f.w;w.manager=fleet[0]?.manager||w.manager;w.id=i+1;w.manager.workers.set(w.id,w);w.running=true;w.bot.entity.position=new Vec3(-1.5,66,-1.5);w.state.area={x1:0,z1:0,x2:15,z2:0};w.state.floor=63;w.state.ceiling=64;fleet.push(w);}
 for(const w of fleet){const b=w.chooseTarget();assert(b);assert(!targets.has(b.position.toString()));targets.add(b.position.toString());w.miningTarget=b;w.approachPlan={};}
});
