'use strict';
const {Vec3}=require('vec3');
const {key}=require('./util');
class World {
 constructor(bot){this.bot=bot;this.columns=new Map();this.known=new Set();this.overrides=new Map();this.loading=Promise.resolve();this.requested=new Map();this.wireIds=new Map();}
 reset(){this.columns.clear();this.known.clear();this.overrides.clear();this.requested.clear();}
 init(packet){
  this.reset();this.wireIds.clear();this.hashRegistry=null;this.unknownRuntimeIds=new Set();this.bot.worldGeneration=(this.bot.worldGeneration||0)+1;this.bot.terrainEstablished=false;this.bot.terrainDecodeFailed=false;this.bot.positionFrames={};this.bot.initialDataAcknowledged=false;
  this.registry=require('prismarine-registry')(`bedrock_${this.bot.client.options.version}`);
  // 1.26 retains the 1.18+ Bedrock subchunk format; use that implementation explicitly.
  this.Chunk=require('prismarine-chunk/src/bedrock/1.18/chunk')(this.registry);
  this.hashed=!!packet.block_network_ids_are_hashes;this.registry.handleStartGame({...packet,itemstates:packet.itemstates||this.registry.writeItemStates()});this.bot.registry=this.registry;this.networkPalette=require('./network-palette').install(this.registry,this.bot.client.options.version,this.hashed);if(this.networkPalette){for(const [state,id]of this.networkPalette.reverse)this.wireIds.set(state,id);this.bot.emit('diagnostic',`地形Runtime対応表: protocol=2193 states=${this.networkPalette.info.entries}`);}
  const mirror=this,Base=new this.Chunk({x:0,z:0}).Section;
  this.Section=class extends Base{
   loadRuntimePalette(layer,stream,size){this.palette[layer]=[];for(let i=0;i<size;i++){const id=stream.readZigZagVarInt(),block=mirror.paletteEntry(id);this.palette[layer][i]={...block,stateId:block.stateId,count:0};}}
   loadPalettedBlocks(layer,stream,bits,format){if(format===require('prismarine-chunk/src/bedrock/common/constants').StorageType.Runtime&&bits===0){const id=stream.readZigZagVarInt(),block=mirror.paletteEntry(id);this.palette[layer]=[];this.blocks[layer]=new(require('prismarine-chunk/src/bedrock/common/PalettedStorage'))(1);this.palette[layer][0]={...block,count:4096};return;}return super.loadPalettedBlocks(layer,stream,bits,format);}
  };
 }
 paletteEntry(id){const block=this.resolve(id);if(block)return {...block,runtimeId:id>>>0};const first=!this.unknownRuntimeIds.has(id);this.unknownRuntimeIds.add(id);if(first)this.bot.emit('diagnostic',`未対応Runtime ID ${id}: 該当ブロックだけを不明として保持し、周囲の地形は読み込みます`);return {stateId:this.registry.blocksByName.barrier.defaultState,unresolvedRuntimeId:id,count:0};}
 resolve(id){if(this.networkPalette){const unsigned=id>>>0;let block=(this.hashed?this.networkPalette.hashes:this.networkPalette.ordered).get(unsigned);if(!block&&!this.hashed){block=this.networkPalette.hashes.get(unsigned);if(block){this.hashed=true;this.bot.emit('diagnostic','チャンクのRuntime IDをハッシュ形式として認識しました');}}return block;}let block=this.registry.blocksByRuntimeId[id]||this.registry.blocksByRuntimeId[id>>>0]||this.registry.blocksByRuntimeId[id|0];if(!block){if(!this.hashRegistry){this.hashRegistry=new Map();const Block=require('prismarine-block')(this.registry);this.registry.blockStates.forEach((b,i)=>{const hash=Block.getHash(b.name,b.states);this.hashRegistry.set(hash>>>0,{...this.registry.blocksByStateId[i],stateId:i});});}block=this.hashRegistry.get(id>>>0);if(block&&!this.hashed){this.hashed=true;this.bot.emit('diagnostic','チャンクのRuntime IDをハッシュ形式として認識しました');}}if(block)this.wireIds.set(block.stateId,id>>>0);return block;}
 createColumn(x,z){const c=new this.Chunk({x,z});c.Section=this.Section;if(this.bot.dimensionId!==0)c.setBounds(0,this.bot.dimensionId===1?8:16);return c;}
 column(x,z){const k=`${x},${z}`;if(!this.columns.has(k))this.columns.set(k,this.createColumn(x,z));return this.columns.get(k);}
 async chunk(p){if(!this.Chunk)return;if(p.cache_enabled)throw Error('キャッシュ済みチャンクは非対応です');
  const c=this.column(p.x,p.z); const count=p.sub_chunk_count|0;
  if(count>=0){const Stream=require('prismarine-chunk/src/bedrock/common/Stream');const {StorageType}=require('prismarine-chunk/src/bedrock/common/constants');const stream=new Stream(p.payload),staged=this.createColumn(p.x,p.z),parsed=[];for(let i=0;i<count;i++){const section=new this.Section(this.registry,staged.Block,{y:staged.minCY+i,subChunkVersion:9});section.decode(StorageType.Runtime,stream);const sy=section.y>127?section.y-256:section.y;section.y=sy;staged.setSection(sy,section);parsed.push(section);}this.alignLegacy(staged,parsed);this.columns.set(`${p.x},${p.z}`,staged);for(let y=staged.minCY;y<staged.maxCY;y++)this.known.add(`${p.x},${y},${p.z}`);}
  else { // Limit requests to nearby height layers, then ask higher layers on demand.
   const y=Math.floor((this.bot.entity?.position.y||64)/16);this.request(p.x,p.z,y-2,y+2);
  }
  this.trim();
 }
 alignLegacy(column,sections){if(this.bot.dimensionId!==0||!sections.length||sections.some(s=>s.subChunkVersion!==8))return;const p=this.bot.entity?.position;if(!p||(p.x>>4)!==column.x||(p.z>>4)!==column.z)return;
  const supported=shift=>{for(let y=Math.floor(p.y);y>=Math.floor(p.y)-8;y--){const at=n=>{const q={x:Math.floor(p.x)&15,y:n-shift,z:Math.floor(p.z)&15,l:0},section=column.getSection(q),entry=section?.blocks[0]?section.getPaletteEntry(0,q.x,q.y&15,q.z):null;return entry?.unresolvedRuntimeId!==undefined?{name:'unknown',boundingBox:'empty'}:column.getBlock(q);};const floor=at(y-1),feet=at(y),head=at(y+1);if(floor.boundingBox==='block'&&feet.name==='air'&&head.name==='air')return true;}return false;};
  if(supported(0)||!supported(64))return;column.sections=[];column.setBounds(0,Math.max(16,sections.length));for(const section of sections){section.y+=4;column.setSection(section.y,section);}this.bot.emit('diagnostic','旧式v8チャンクの床を照合し、Y=0からの配置として読み込みました');
 }
 request(x,z,min,max){const req=[];for(let y=Math.max(-4,min);y<=Math.min(19,max);y++){const k=`${x},${y},${z}`;if(!this.known.has(k)&&Date.now()-(this.requested.get(k)||0)>10000){req.push({dx:0,dy:y,dz:0});this.requested.set(k,Date.now());}}
  if(req.length)this.bot.client.queue('subchunk_request',{dimension:this.bot.dimensionId,origin:{x,y:0,z},requests:req});
 }
 async subchunk(p){for(const e of p.entries||[]){const x=p.origin.x+e.dx,y=p.origin.y+e.dy,z=p.origin.z+e.dz;
  if(e.result==='success'||e.result===1){if(p.cache_enabled)throw Error('キャッシュ済みサブチャンクは非対応です');const c=this.column(x,z),section=new this.Section(this.registry,c.Block,{y,subChunkVersion:9});section.decode(require('prismarine-chunk/src/bedrock/common/constants').StorageType.Runtime,e.payload);const sy=section.y>127?section.y-256:section.y;c.setSection(sy,section);this.known.add(`${x},${sy},${z}`);}
  else if(e.result==='success_all_air'||e.result===6){this.column(x,z);this.known.add(`${x},${y},${z}`);}
 }this.trim();}
 update(p){if(p.layer!==undefined&&p.layer!==0)return;this.overrides.set(key(p.position),p.block_runtime_id);this.bot.emit('worldUpdate',p.position);}
 get(p){p=new Vec3(Math.floor(p.x),Math.floor(p.y),Math.floor(p.z));if(!this.registry)return null;
  const override=this.overrides.get(key(p));let b,entry;
  if(override!==undefined){const data=this.resolve(override);if(!data)return this.unknown(p);const native=require('prismarine-block')(this.registry).fromStateId(data.stateId);b={...data,properties:native.getProperties?.()||{},boundingBox:native.boundingBox,shapes:native.shapes,position:p,stateId:override};}
  else{const cx=p.x>>4,cz=p.z>>4;if(!this.known.has(`${cx},${p.y>>4},${cz}`))return null;const c=this.columns.get(`${cx},${cz}`);if(!c)return null;
   const section=c.getSection(p);entry=section?.blocks[0]?section.getPaletteEntry(0,p.x&15,p.y&15,p.z&15):null;if(entry?.unresolvedRuntimeId!==undefined)return this.unknown(p,entry.unresolvedRuntimeId);const native=c.getBlock(new Vec3(p.x&15,p.y,p.z&15));if(!native||!native.name)return this.unknown(p);b={name:native.name,type:native.type,hardness:native.hardness,material:native.material,diggable:native.diggable,boundingBox:native.boundingBox,position:p,
    properties:native.getProperties?.()||{},shapes:native.shapes,stateId:entry?.runtimeId??this.wireIds.get(native.stateId)??(this.hashed?native.hash:native.stateId)};
  }
  b.isAir=['air','cave_air','void_air'].includes(b.name);b.isLiquid=/^(flowing_)?(water|lava)$/.test(b.name);b.solid=b.boundingBox==='block'&&!b.isAir;b.isClimbable=['ladder','vine','scaffolding'].includes(b.name);return b;
 }
 unknown(p,runtimeId){return {name:'unknown',runtimeId,position:p,boundingBox:'block',solid:true,isAir:false,isLiquid:false,diggable:false,hardness:-1};}
 trim(){const p=this.bot.entity?.position;if(!p)return;for(const k of this.columns.keys()){const[x,z]=k.split(',').map(Number);if(Math.abs(x-(p.x>>4))>6||Math.abs(z-(p.z>>4))>6){this.columns.delete(k);for(let y=-4;y<20;y++)this.known.delete(`${x},${y},${z}`);}}
  for(const k of this.overrides.keys()){const[x,,z]=k.split(',').map(Number);if(Math.abs(x-p.x)>112||Math.abs(z-p.z)>112)this.overrides.delete(k);}}
}
module.exports={World};
