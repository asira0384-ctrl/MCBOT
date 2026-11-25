'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3');
const {createSerializer,createDeserializer}=require('bedrock-protocol/src/transforms/serializer');
const {normalize}=require('../../src/bedrock/subchunk-request'),{fixture}=require('../helpers/mining-world');
const request=()=>({dimension:0,origin:{x:-3,y:0,z:2},requests:[{dx:0,dy:4,dz:0},{dx:0,dy:5,dz:0}]});
for(const version of ['1.21.2','1.26.51','1.26.60'])test(`${version} preserves distinct requested section heights on the actual wire`,()=>{
 const b={registry:require('prismarine-registry')('bedrock_'+version)},params=normalize(b,request()),buffer=createSerializer(version).createPacketBuffer({name:'subchunk_request',params}),p=createDeserializer(version).parsePacketBuffer(buffer).data.params;
 assert.deepEqual(p.origin,{x:-3,y:0,z:2});assert.deepEqual(p.requests.map(r=>r.y??r.dy),[4,5]);
 if(version==='1.26.51')assert.equal(buffer.toString('hex'),'af010002000400000500fdffffff0000000002000000');
});
test('offsets are deduplicated and invalid values cannot silently become zero',()=>{
 const b={registry:require('prismarine-registry')('bedrock_1.26.51')},p=request();p.requests.push({x:0,y:4,z:0});assert.equal(normalize(b,p).requests.length,2);for(const value of [undefined,NaN,1.5,128,-129])assert.throws(()=>normalize(b,{...request(),requests:[{x:0,y:value,z:0}]}));assert.throws(()=>normalize(b,{...request(),origin:{x:Infinity,y:0,z:0}}));
});
test('full-column and unannounced chunks never cause unsolicited refresh requests',async t=>{
 const f=fixture(t),w=f.b.worldMirror,before=f.packets.length;assert.equal(w.request(-3,2,4,5,{force:true}),0);assert.equal(f.packets.length,before);await w.chunk({x:-3,z:2,sub_chunk_count:0,cache_enabled:false,payload:Buffer.alloc(0)});assert.equal(w.request(-3,2,4,5,{force:true}),0);assert(!f.packets.slice(before).some(p=>p.name==='subchunk_request'));
});
test('announced request columns load the correct heights and known sections are not re-requested',async t=>{
 const f=fixture(t),w=f.b.worldMirror;await w.chunk({x:-3,z:2,sub_chunk_count:0xffffffff,cache_enabled:false,payload:Buffer.alloc(0)});const p=f.packets.findLast(p=>p.name==='subchunk_request');assert.deepEqual(p.params.requests.map(r=>r.y),[2,3,4,5,6]);assert.equal(new Set(p.params.requests.map(r=>r.y)).size,5);
 await w.subchunk({dimension:0,cache_enabled:false,origin:{x:-3,y:0,z:2},entries:[{dx:0,dy:4,dz:0,result:'success_all_air'}]});assert(w.known.has('-3,4,2'));assert(w.get(new Vec3(-48,65,32)).isAir);const before=f.packets.length;assert.equal(w.request(-3,2,4,4,{force:true}),0);assert.equal(f.packets.length,before);
});
test('a server known-air limit marks upper sections air instead of waiting on impossible requests',async t=>{
 const f=fixture(t),w=f.b.worldMirror;await w.chunk({x:-3,z:2,sub_chunk_count:0xfffffffe,highest_subchunk_count:4,cache_enabled:false,payload:Buffer.alloc(0)});assert.equal(w.subchunkColumns.get('-3,2').max,0);assert(w.known.has('-3,5,2'));assert(w.get(new Vec3(-48,80,32)).isAir);assert.equal(w.request(-3,2,4,5),0);
});
test('dimension limits and response dimension checks keep unrelated terrain out',async t=>{
 const f=fixture(t),w=f.b.worldMirror;f.b.dimensionId=1;await w.chunk({x:0,z:0,sub_chunk_count:0xffffffff,cache_enabled:false,payload:Buffer.alloc(0)});w.request(0,0,-4,19);assert(f.packets.filter(p=>p.name==='subchunk_request').flatMap(p=>p.params.requests).every(r=>r.y>=0&&r.y<=7));await w.subchunk({dimension:0,origin:{x:0,y:0,z:0},entries:[{dx:0,dy:4,dz:0,result:'success_all_air'}]});assert(!w.known.has('0,4,0'));
});
