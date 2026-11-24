'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{adapter}=require('./helpers/adapter');
function health(b,c,n){c.emit('update_attributes',{runtime_entity_id:b._runtimeEntityId,attributes:[{name:'minecraft:health',current:n}]});}
test('fresh positive health before READY is preserved and completes respawn after acknowledgment',t=>{
 const {b,c}=adapter(t);health(b,c,0);health(b,c,20);assert(b.dead);
 c.emit('respawn',{runtime_entity_id:b._runtimeEntityId,state:1,position:{x:2,y:67.13,z:3}});b.respawn();
 assert.equal(b.dead,false);assert.equal(b.health,20);
});
test('report sequence: positive health plus own reset clears stale death without READY, foreign resets cannot',t=>{
 const {b,c}=adapter(t);let completed=0;b.on('respawned',()=>completed++);
 health(b,c,0);health(b,c,20);assert(b.dead);
 c.emit('move_player',{runtime_id:123n,mode:'reset',position:{x:2,y:67.13,z:3},on_ground:true});assert(b.dead);
 c.emit('move_player',{runtime_id:b._runtimeEntityId,mode:'reset',position:{x:232.5,y:67.13,z:353.5},on_ground:true});
 assert.equal(b.dead,false);assert.equal(completed,1);
 health(b,c,0);c.emit('move_player',{runtime_id:b._runtimeEntityId,mode:'reset',position:{x:232.5,y:67.13,z:353.5},on_ground:true});assert(b.dead);
 health(b,c,20);assert.equal(b.dead,false);assert.equal(completed,2);
});
