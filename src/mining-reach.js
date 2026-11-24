'use strict';
// Reach is measured from the eye to the closest point on the target block,
// not the scan window or a distance that allows remote breaking.
function distance(eye,block){
 if(!eye||!block?.position)return Infinity;
 const p=block.position,shapes=Array.isArray(block.shapes)&&block.shapes.length?block.shapes:[[0,0,0,1,1,1]];
 return Math.min(...shapes.filter(s=>Array.isArray(s)&&s.length===6&&s.every(Number.isFinite)).map(s=>Math.hypot(...['x','y','z'].map((axis,i)=>{const n=eye[axis]-p[axis];return n<s[i]?s[i]-n:n>s[i+3]?n-s[i+3]:0;}))));
}
function within(bot,block,range){return typeof range==='number'&&Number.isFinite(range)&&range>0&&!!bot.entity?.position&&distance(bot.entity.position.offset(0,1.62,0),block)<=range;}
module.exports={distance,within};
