'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3');
const nuke=require('../src/modules/world/nuke'),desktop=require('../src/desktop-modules'),registry=require('minecraft-data')('bedrock_1.21.2');
const values=raw=>desktop.validate('Nuke',{...nuke.values({}),...raw});
test('two corners include both endpoints, reverse axes and the lowest world layer',()=>{
 const p=nuke.plan(values({'Start X':'12','Start Y':'-64','Start Z':'9','End X':'-2','End Y':'-64','End Z':'-3'}),registry);
 assert.deepEqual(p.area,{x1:-2,x2:12,z1:-3,z2:9});assert.equal(p.floor,-65);assert.equal(p.ceiling,-64);assert.deepEqual(p.miningChunks,[]);
 assert.equal(nuke.values(p)['Start Y'],'-64');
});
test('invalid coordinates, huge regions, invalid block filters and scaffold IDs are rejected',()=>{
 for(const row of [{'Start Y':'-65'},{'End Y':'320'},{'End X':''},{'End X':'1.5'},{'End X':'30000001'},{'End X':'100000','End Z':'100000'},{Blocks:'not_a_real_block'},{'Scaffold Block':'air'}])assert.throws(()=>nuke.plan(values(row),registry));
 assert.throws(()=>values({Range:7}));
 const p=nuke.plan(values({Blocks:'stone, dirt',Scaffold:false,'Scaffold Block':'obsidian','Max Drop':4}),registry);assert.deepEqual(p.miningFilter,['stone','dirt']);assert.equal(p.scaffoldEnabled,false);assert.equal(p.maxDrop,4);
});
test('changing bounds restarts active mining once; changing range does not stop it',()=>{
 const s={},w={bot:{registry},running:false,stop(){this.stops=(this.stops||0)+1;this.running=false;},start(){this.starts=(this.starts||0)+1;this.running=true;}},m={store:{bot:()=>s},workers:new Map([[1,w]])};
 nuke.apply(m,1,values({}),null);assert(!w.starts);nuke.apply(m,1,values({}),true);assert.equal(w.starts,1);
 nuke.apply(m,1,values({'End Y':'90'}),null);assert.equal(w.starts,2);assert(w.running);
 const stops=w.stops;nuke.apply(m,1,values({'End Y':'90',Range:4}),null);assert.equal(w.stops,stops);assert(w.running);assert.equal(s.miningRange,4);
 const old=structuredClone(s);assert.throws(()=>nuke.apply(m,1,values({'End X':'1.5'}),null));assert.deepEqual(s,old);assert(w.running);
 nuke.apply(m,1,values({}),false);assert.equal(w.running,false);
});
test('Nuke API saves all settings without running area/floor commands that stop the miner',async()=>{
 const s={},w={bot:{registry},running:true,stop(){this.running=false;},start(){this.running=true;}},m={store:{bot:()=>s,save(){}},workers:new Map([[1,w]]),execute(){throw Error('legacy command must not run');},changed(){}};
 const r=await desktop.apply({manager:m,targets:()=>[1]}, {},{module:'Nuke',enabled:null,target:'1',values:values({'Start Y':'64','End Y':'66'})});assert(r.ok);assert(w.running);assert.equal(s.floor,63);assert.equal(s.ceiling,66);
});
test('received top-layer blocks can be mined while another column remains unknown',t=>{
 const {fixture}=require('./helpers/mining-world'),{b,w,set}=fixture(t);w.state.area={x1:0,x2:1,z1:0,z2:0};w.state.floor=64;w.state.ceiling=65;b.entity.position=new Vec3(4.5,65,.5);set(new Vec3(1,65,0),'stone');
 const blockAt=b.blockAt;b.blockAt=p=>p.x===0&&p.y===65&&p.z===0?{name:'unknown',position:p.floored()}:blockAt(p);w.running=true;
 const target=w.miner.scan();assert(target);assert.equal(target.name,'stone');assert.equal(target.position.x,1);assert.equal(target.position.y,65);assert.equal(w.miner.done,false);
});
