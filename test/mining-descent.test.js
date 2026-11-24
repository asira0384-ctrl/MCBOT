'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3');
const {fixture}=require('./helpers/mining-world'),navigation=require('../modules/movement/navigation/navigation'),{stands}=require('../modules/world/mining/mining');

function pit(t){const f=fixture(t);f.b.entity.position=new Vec3(.5,70,.5);f.b.entity.onGround=true;f.w.state.miningRange=5;f.w.state.maxDrop=8;f.w.state.ceiling=75;f.w.running=true;f.b.items[2]={...f.item('cobblestone',20),count:64};f.set(new Vec3(0,69,0),'obsidian');f.set(new Vec3(6,69,0),'stone');return {...f,target:f.b.blockAt(new Vec3(6,69,0))};}

test('a target above the lower floor still offers reachable natural mining stances below its Y',t=>{
 const f=pit(t),spots=stands(f.w,f.target,{allowScaffold:false});assert(spots.some(p=>p.y===65));for(const p of spots)assert(f.b.blockAt(p.offset(0,-1,0)).solid);const goal=spots.find(p=>p.y===65),path=navigation.groundPath(f.b,f.b.entity.position,goal,f.travel.groundOptions({dig:true,minY:-64}));assert(path.reached);assert.equal(path.placements,0);assert(path.some(s=>s.action==='drop'));
});

test('Nuke descends to the existing floor and approaches without building a bridge',async t=>{
 const f=pit(t),steps=[],placements=[];f.w.placeOwned=async(...args)=>placements.push(args);f.travel.moveStep=async(point,action)=>{steps.push({point,action});f.b.entity.position=point.clone();f.b.entity.onGround=true;};
 for(let i=0;i<5&&!f.b.reach(f.target,5);i++)await f.w.approach(f.target);
 assert(steps.some(s=>s.action==='drop'));assert.equal(placements.length,0);assert(f.b.reach(f.target,5));assert.equal(f.w.approachPlan.placements,0);
});

test('a cached bridge approach is reconsidered when a lower floor is available',async t=>{
 const f=pit(t);f.w.approachPlan={targetKey:'0:6,69,0',goal:new Vec3(4.5,70,.5),placements:4,at:Date.now(),progressAt:Date.now(),remaining:4,score:1};let selected,options;f.travel.walk=async(p,mode,signal,o)=>{selected=p;options=o;};await f.w.approach(f.target);assert.equal(selected.y,65);assert.equal(options.allowScaffold,false);assert.equal(f.w.approachPlan.placements,0);
});

test('lower routes still obey Max Drop and never assume an unknown or lava floor is safe',t=>{
 const f=pit(t),entry=new Vec3(1,70,0);assert.equal(navigation.dropLanding(f.b,entry,3),null);assert(navigation.dropLanding(f.b,entry,8));f.set(new Vec3(1,64,0),'lava');assert.equal(navigation.dropLanding(f.b,entry,8),null);f.set(new Vec3(1,64,0),'air');const previous=f.b.blockAt;f.b.blockAt=p=>p.x===1&&p.y===64&&p.z===0?{name:'unknown',position:p}:previous(p);assert.equal(navigation.dropLanding(f.b,entry,8),null);
});
