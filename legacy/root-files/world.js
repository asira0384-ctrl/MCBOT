'use strict';
const {Vec3}=require('vec3');
const {key}=require('./util');
class World {
 constructor(bot){this.bot=bot;this.columns=new Map();this.known=new Set();this.overrides=new Map();this.loading=Promise.resolve();this.requested=new Map();}
 init(packet){
  this.registry=require('prismarine-registry')(`bedrock_${this.bot.client.options.version}`);
  // 1.26 retains the 1.18+ Bedrock subchunk format; use that implementation explicitly.
  this.Chunk=require('prismarine-chunk/src/bedrock/1.18/chunk')(this.registry);
  this.hashed=!!packet.block_network_ids_are_hashes;this.registry.handleStartGame({...packet,itemstates:packet.itemstates||this.registry.writeItemStates()});this.bot.registry=this.registry;
 }
 column(x,z){const k=`${x},${z}`;if(!this.columns.has(k)){const c=new this.Chunk({x,z});if(this.bot.dimensionId!==0)c.setBounds(0,this.bot.dimensionId===1?8:16);this.columns.set(k,c);}return this.columns.get(k);}
 async chunk(p){if(!this.Chunk)return;if(p.cache_enabled)throw Error('キャッシュ済みチャンクは非対応です');
  const c=this.column(p.x,p.z); const count=p.sub_chunk_count|0;
  if(count>=0){const Stream=require('prismarine-chunk/src/bedrock/common/Stream');const {StorageType}=require('prismarine-chunk/src/bedrock/common/constants');const stream=new Stream(p.payload);c.sections=[];for(let i=0;i<count;i++){const section=new c.Section(this.registry,c.Block,{y:c.minCY+i,subChunkVersion:9});section.decode(StorageType.Runtime,stream);const sy=section.y>127?section.y-256:section.y;c.setSection(sy,section);}for(let y=c.minCY;y<c.maxCY;y++)this.known.add(`${p.x},${y},${p.z}`);}
  else { // Limit requests to nearby height layers, then ask higher layers on demand.
   const y=Math.floor((this.bot.entity?.position.y||64)/16);this.request(p.x,p.z,y-2,y+2);
  }
  this.trim();
 }
 request(x,z,min,max){const req=[];for(let y=Math.max(-4,min);y<=Math.min(19,max);y++){const k=`${x},${y},${z}`;if(!this.known.has(k)&&Date.now()-(this.requested.get(k)||0)>10000){req.push({dx:0,dy:y,dz:0});this.requested.set(k,Date.now());}}
  if(req.length)this.bot.client.queue('subchunk_request',{dimension:this.bot.dimensionId,origin:{x,y:0,z},requests:req});
 }
 async subchunk(p){for(const e of p.entries||[]){const x=p.origin.x+e.dx,y=p.origin.y+e.dy,z=p.origin.z+e.dz;
  if(e.result==='success'||e.result===1){if(p.cache_enabled)throw Error('キャッシュ済みサブチャンクは非対応です');await this.column(x,z).networkDecodeSubChunkNoCache(y,e.payload);this.known.add(`${x},${y},${z}`);}
  else if(e.result==='success_all_air'||e.result===6){this.column(x,z);this.known.add(`${x},${y},${z}`);}
 }this.trim();}
 update(p){if(p.layer!==undefined&&p.layer!==0)return;this.overrides.set(key(p.position),p.block_runtime_id);this.bot.emit('worldUpdate',p.position);}
 get(p){p=new Vec3(Math.floor(p.x),Math.floor(p.y),Math.floor(p.z));if(!this.registry)return null;
  const override=this.overrides.get(key(p));let b;
  if(override!==undefined){const data=this.registry.blocksByRuntimeId[override];if(!data)return this.unknown(p);b={...data,position:p,stateId:override};}
  else{const cx=p.x>>4,cz=p.z>>4;if(!this.known.has(`${cx},${p.y>>4},${cz}`))return null;const c=this.columns.get(`${cx},${cz}`);if(!c)return null;
   const native=c.getBlock(new Vec3(p.x&15,p.y,p.z&15));if(!native||!native.name)return this.unknown(p);b={name:native.name,type:native.type,hardness:native.hardness,material:native.material,diggable:native.diggable,boundingBox:native.boundingBox,position:p,
    stateId:native.runtimeId??(this.hashed?native.getHash():native.stateId)};
  }
  b.isAir=['air','cave_air','void_air'].includes(b.name);b.isLiquid=/^(flowing_)?(water|lava)$/.test(b.name);b.solid=b.boundingBox==='block'&&!b.isAir;b.isClimbable=['ladder','vine','scaffolding'].includes(b.name);return b;
 }
 unknown(p){return {name:'unknown',position:p,boundingBox:'block',solid:true,isAir:false,isLiquid:false,diggable:false,hardness:-1};}
 trim(){const p=this.bot.entity?.position;if(!p)return;for(const k of this.columns.keys()){const[x,z]=k.split(',').map(Number);if(Math.abs(x-(p.x>>4))>6||Math.abs(z-(p.z>>4))>6){this.columns.delete(k);for(let y=-4;y<20;y++)this.known.delete(`${x},${y},${z}`);}}
  for(const k of this.overrides.keys()){const[x,,z]=k.split(',').map(Number);if(Math.abs(x-p.x)>112||Math.abs(z-p.z)>112)this.overrides.delete(k);}}
}
module.exports={World};
