'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const zlib=require('node:zlib');const {Vec3}=require('vec3');const {renderView}=require('../src/view');
function rawPNG(b){assert.equal(b.subarray(1,4).toString(),'PNG');const parts=[];for(let i=8;i<b.length;){const n=b.readUInt32BE(i);if(b.toString('ascii',i+4,i+8)==='IDAT')parts.push(b.subarray(i+8,i+8+n));i+=12+n;}return zlib.inflateSync(Buffer.concat(parts));}
test('view renders real received blocks, distinguishes unknown terrain and never moves the bot',()=>{
 const bot={connected:true,entity:{position:new Vec3(128,68.38,128),yaw:0,pitch:0},blockAt:()=>null};const before=bot.entity.position.clone();
 const unknown=renderView(bot,{width:32,height:18});assert.deepEqual(unknown.hits,{blocks:0,unknown:576,air:0});assert.equal(rawPNG(unknown.buffer).length,18*(32*3+1));
 bot.blockAt=()=>({name:'obsidian'});assert.equal(renderView(bot,{width:32,height:18}).hits.blocks,576);
 bot.blockAt=()=>({name:'air',isAir:true});assert.equal(renderView(bot,{width:32,height:18,range:2}).hits.air,576);assert.deepEqual(bot.entity.position,before);
 bot.connected=false;assert.throws(()=>renderView(bot),/接続/);
});
