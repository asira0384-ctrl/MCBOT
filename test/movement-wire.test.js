'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{mode,send}=require('../src/movement-wire');
function fixture(authority){return {advertisedMovement:authority,movementMode:'auto',registry:require('prismarine-registry')('bedrock_1.21.2'),controlState:{},_runtimeEntityId:1n,entity:{onGround:true},sentInputs:0,sentLegacyMoves:0};}
const input=()=>({position:{x:0,y:65.62,z:0},delta:{x:0,y:0,z:0},pitch:0,yaw:0,head_yaw:0,input_data:0n,tick:1n});
test('advertised client authority sends one legacy packet, not both packet formats',()=>{const b=fixture('client'),sent=[];send(b,input(),(n,p)=>sent.push({n,p}));assert.deepEqual(sent.map(p=>p.n),['move_player']);assert.equal(b.sentInputs,0);assert.equal(b.sentLegacyMoves,1);});
test('server/unknown authority does not switch to mixed packets after corrections',()=>{for(const authority of ['server','server_with_rewind','未指定']){const b=fixture(authority);b.legacyMovementFallback=true;const sent=[];send(b,input(),n=>sent.push(n));assert.deepEqual(sent,['player_auth_input']);assert.equal(mode(b),'auth-input');}});
test('explicit compatibility mode remains an explicit choice',()=>{const b=fixture('server');b.movementMode='both';const sent=[];send(b,input(),n=>sent.push(n));assert.deepEqual(sent,['move_player','player_auth_input']);});
