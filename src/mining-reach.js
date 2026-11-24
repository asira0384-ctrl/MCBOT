'use strict';
// Reach is measured from the eye to the closest point on the target block,
// not the scan window or a distance that allows remote breaking.
function distance(eye,block){
 if(!eye||!block?.position)return Infinity;
 const p=block.position,shapes=Array.isArray(block.shapes)&&block.shapes.length?block.shapes:[[0,0,0,1,1,1]];
 return Math.min(...shapes.filter(s=>Array.isArray(s)&&s.length===6&&s.every(Number.isFinite)).map(s=>Math.hypot(...['x','y','z'].map((axis,i)=>{const n=eye[axis]-p[axis];return n<s[i]?s[i]-n:n>s[i+3]?n-s[i+3]:0;}))));
}
function within(bot,block,range){return typeof range==='number'&&Number.isFinite(range)&&range>0&&!!bot.entity?.position&&distance(bot.entity.position.offset(0,1.62,0),block)<=range;}
// Aim at a visible point on a face that the player can actually reach.
function aim(bot,block,range=5,eye=bot.entity.position.offset(0,1.62,0)){
 const {rayClear}=require('./geometry'),p=block.position,axes=['x','y','z'];
 const boxes=block.shapes?.length?block.shapes:[[0,0,0,1,1,1]],points=[];
 for(const box of boxes){
  for(let axis=0;axis<3;axis++){
   const offset=eye[axes[axis]]-p[axes[axis]],high=offset>=box[axis+3];
   if(!high&&offset>box[axis])continue;
   const coords=axes.map((k,i)=>Math.max(box[i]+.001,Math.min(box[i+3]-.001,eye[k]-p[k])));
   coords[axis]=box[axis+(high?3:0)];
   const point=p.offset(...coords),length=eye.distanceTo(point);
   if(length<=range)points.push({point,length,face:[[4,5],[0,1],[2,3]][axis][Number(high)]});
   const center=box.slice(0,3).map((v,i)=>(v+box[i+3])/2);center[axis]=coords[axis];
   const mid=p.offset(...center),dist=eye.distanceTo(mid);
   if(dist<=range)points.push({point:mid,length:dist,face:[[4,5],[0,1],[2,3]][axis][Number(high)]});
  }
 }
 return points.sort((a,b)=>a.length-b.length).find(({point})=>rayClear(bot,eye,point,{ignore:[p]}))||null;
}
module.exports={distance,within,aim};
