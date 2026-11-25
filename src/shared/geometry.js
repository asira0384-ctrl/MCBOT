'use strict';
const {Vec3}=require('vec3');
const key=p=>`${Math.floor(p.x)},${Math.floor(p.y)},${Math.floor(p.z)}`;
function segmentBox(from,to,box){let near=0,far=1;for(let k=0;k<3;k++){const axis=['x','y','z'][k],d=to[axis]-from[axis];if(Math.abs(d)<1e-9){if(from[axis]<box[k]-1e-7||from[axis]>=box[k+3]-1e-7)return false;continue;}let a=(box[k]-from[axis])/d,b=(box[k+3]-from[axis])/d;if(a>b)[a,b]=[b,a];near=Math.max(near,a);far=Math.min(far,b);if(near>=far-1e-7)return false;}return far>1e-6&&near<1-1e-6;}
function rayClear(bot,from,to,{ignore=[],blocks=[]}={}){
 const ignored=new Set(ignore.map(key)),checked=new Set(),delta=to.minus(from),steps=Math.max(1,Math.ceil(delta.norm()*8));
 for(const p of blocks)if(segmentBox(from,to,[p.x,p.y,p.z,p.x+1,p.y+1,p.z+1]))return false;
 for(let i=0;i<=steps;i++){
  const p=from.plus(delta.scaled(i/steps)).floored();
  for(const dy of [0,-1]){const q=p.offset(0,dy,0),id=key(q);if(checked.has(id)||ignored.has(id))continue;checked.add(id);const b=bot.blockAt(q);
   if(!b||b.name==='unknown'){if(dy===0)return false;continue;}if(!b.solid)continue;
   const shapes=Array.isArray(b.shapes)?b.shapes:[[0,0,0,1,/fence|_wall$/.test(b.name)?1.5:1,1]];
   for(const s of shapes)if(segmentBox(from,to,[q.x+s[0],q.y+s[1],q.z+s[2],q.x+s[3],q.y+s[4],q.z+s[5]]))return false;
  }
 }return true;
}
function facePoint(block,face=1){const p=block.position;return new Vec3(p.x+(face===4?0:face===5?1:.5),p.y+(face===0?0:face===1?1:.5),p.z+(face===2?0:face===3?1:.5));}
function placementSupport(bot,target,virtual=[]){
 const dirs=[[0,-1,0,1],[0,1,0,0],[-1,0,0,5],[1,0,0,4],[0,0,-1,3],[0,0,1,2]];
 for(const [x,y,z,face]of dirs){const p=target.offset(x,y,z),planned=virtual.find(q=>key(q)===key(p)),block=planned?{position:p,solid:true,name:'obsidian'}:bot.blockAt(p);
  if(block?.solid&&bot.reach(block)&&rayClear(bot,bot.entity.position.offset(0,1.62,0),facePoint(block,face),{ignore:[p],blocks:virtual.filter(q=>key(q)!==key(p))}))return {block,face};
 }return null;
}
module.exports={rayClear,segmentBox,facePoint,placementSupport};
