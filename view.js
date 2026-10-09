'use strict';
const zlib=require('node:zlib');
const {Vec3}=require('vec3');
// Render received voxel data only. Unknown terrain is visibly distinct from air.
function color(name){if(/obsidian/.test(name))return[43,27,65];if(/lava/.test(name))return[255,98,18];if(/water/.test(name))return[32,104,204];if(/grass|leaves|slime/.test(name))return[79,146,65];if(/dirt|wood|log|planks/.test(name))return[130,91,55];if(/sand/.test(name))return[209,195,137];if(/netherrack/.test(name))return[130,48,49];if(/bedrock|deepslate/.test(name))return[65,68,72];return[143,148,154];}
function crc32(b){let crc=0xffffffff;for(const v of b){crc^=v;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return(crc^0xffffffff)>>>0;}
function chunk(type,data){const t=Buffer.from(type);const out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);t.copy(out,4);data.copy(out,8);out.writeUInt32BE(crc32(Buffer.concat([t,data])),data.length+8);return out;}
function png(width,height,rgb){const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=2;const rows=Buffer.alloc(height*(width*3+1));for(let y=0;y<height;y++)rgb.copy(rows,y*(width*3+1)+1,y*width*3,(y+1)*width*3);return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);}
function renderView(bot,{width=256,height=144,range=32}={}){
 if(!bot.connected||!bot.entity)throw Error('先にBotを接続してください');
 const eye=bot.entity.position.offset(0,1.62,0),yaw=bot.entity.yaw||0,pitch=bot.entity.pitch||0;
 const forward={x:-Math.sin(yaw)*Math.cos(pitch),y:-Math.sin(pitch),z:Math.cos(yaw)*Math.cos(pitch)},right={x:Math.cos(yaw),y:0,z:Math.sin(yaw)},up={x:-Math.sin(yaw)*Math.sin(pitch),y:Math.cos(pitch),z:Math.cos(yaw)*Math.sin(pitch)};
 const pixels=Buffer.alloc(width*height*3),cache=new Map(),hits={blocks:0,unknown:0,air:0};
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const sx=(2*(x+.5)/width-1)*Math.tan(Math.PI/6)*width/height,sy=(1-2*(y+.5)/height)*Math.tan(Math.PI/6);
  let dx=forward.x+sx*right.x+sy*up.x,dy=forward.y+sy*up.y,dz=forward.z+sx*right.z+sy*up.z;const len=Math.hypot(dx,dy,dz);dx/=len;dy/=len;dz/=len;
  let rgb=[55+Math.round(35*y/height),93+Math.round(35*y/height),139+Math.round(35*y/height)],kind='air';
  for(let d=.25;d<=range;d+=.25){const px=Math.floor(eye.x+dx*d),py=Math.floor(eye.y+dy*d),pz=Math.floor(eye.z+dz*d),k=`${px},${py},${pz}`;if(!cache.has(k))cache.set(k,bot.blockAt(new Vec3(px,py,pz)));const b=cache.get(k);
   if(!b||b.name==='unknown'){rgb=((x>>3)+(y>>3))%2?[84,68,91]:[58,46,64];kind='unknown';break;}
   if(b.isAir||['air','cave_air','void_air'].includes(b.name))continue;
   const base=color(b.name),shade=Math.max(.32,1-d/(range*1.4));rgb=base.map(c=>Math.round(c*shade));kind='blocks';break;
  }
  hits[kind]++;const i=(y*width+x)*3;pixels[i]=rgb[0];pixels[i+1]=rgb[1];pixels[i+2]=rgb[2];
 }
 // Crosshair marks the current camera direction, without changing the bot's look.
 const cx=width>>1,cy=height>>1;for(let d=-4;d<=4;d++){for(const [x,y]of[[cx+d,cy],[cx,cy+d]])pixels.fill(240,(y*width+x)*3,(y*width+x)*3+3);}
 return {buffer:png(width,height,pixels),hits,eye};
}
module.exports={renderView,png};
