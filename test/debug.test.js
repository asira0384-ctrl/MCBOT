'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),EventEmitter=require('node:events'),{Vec3}=require('vec3');
const {DebugRecorder,markPhysics}=require('../src/debug');
function fixture(){
 const bot=new EventEmitter();Object.assign(bot,{connected:true,entity:{position:new Vec3(.5,70,.5),velocity:new Vec3(0,0,0)},controlState:{},actors:new Map(),
  blockAt:p=>p.y<68?{name:'stone',solid:true,stateId:1,boundingBox:'block'}:null,config:{token:'DO_NOT_EXPORT',authDir:'PRIVATE'},client:{auth:'SECRET'}});
 const r={bot,worker:{},travel:{waiting:''},crystals:{state:'OFF'},config:{},featureErrors:{}};return {b:bot,r,debug:new DebugRecorder(r)};
}
test('debug report distinguishes missing terrain, flight suspension, and pending equipment without exporting credentials',()=>{
 const {b,r,debug}=fixture();markPhysics(b,'terrain_wait','unknown floor');r.travel.flight={goal:b.entity.position.clone(),paused:true};r.busy=true;r.operation='オフハンド装着';
 const report=debug.report(),json=JSON.stringify(report);
 assert(report.reasons.some(s=>s.includes('地形')));assert(report.reasons.some(s=>s.includes('飛行')));assert(report.reasons.some(s=>s.includes('オフハンド')));
 assert.equal(report.nearby.length,45);assert.equal(report.column.length,20);
 assert.equal(report.column.find(x=>x.position.y===67).name,'stone');assert.equal(report.column.find(x=>x.position.y===70).received,false);
 assert(!/DO_NOT_EXPORT|PRIVATE|SECRET/.test(json));debug.destroy();assert.equal(b.listenerCount('physicsTick'),0);
});
test('debug history is bounded, samples positions by value, and survives frequent corrections',t=>{
 t.mock.timers.enable({apis:['Date'],now:100000});const {b,debug}=fixture();
 for(let i=0;i<1300;i++){b.entity.position.y=i;t.mock.timers.tick(50);b.emit('physicsTick');b.emit('forcedMove');}
 assert.equal(debug.samples.length,120);assert.equal(debug.events.length,40);
 const first=debug.samples[0].position.y;b.entity.position.y=-999;assert.equal(debug.samples[0].position.y,first);
 assert(debug.samples.at(-1).at-debug.samples[0].at>=59000);debug.destroy();
});
