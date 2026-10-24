'use strict';
const {Vec3}=require('vec3');const AABB=require('../vendor/bedrockflayer/lib/physics/aabb');const {getSurroundingBBs}=require('../vendor/bedrockflayer/lib/physics/collision');
const finite=p=>p&&['x','y','z'].every(k=>Number.isFinite(p[k]));
function inspect(bot,p){const box=AABB.fromPlayer(p,.6,1.8);let known=true;for(let x=Math.floor(box.minX);x<=Math.floor(box.maxX-1e-7);x++)for(let z=Math.floor(box.minZ);z<=Math.floor(box.maxZ-1e-7);z++)for(let y=Math.floor(box.minY);y<=Math.floor(box.maxY-1e-7);y++){const b=bot.blockAt?.({x,y,z});if(!b||b.name==='unknown')known=false;}
 const verified={blockAt:p=>{const b=bot.blockAt?.(p);return b?.name==='unknown'?null:b;}};const blocks=getSurroundingBBs(verified,box),overlaps=blocks.filter(b=>box.intersects(b)&&['X','Y','Z'].every(axis=>Math.min(box['max'+axis],b['max'+axis])-Math.max(box['min'+axis],b['min'+axis])>1e-6));const support=getSurroundingBBs(verified,box.offset(0,-.05,0)).some(b=>box.offset(0,-.05,0).intersects(b));return {known,overlaps,support};}
function serverPosition(bot,raw,kind='move_player',defaultFrame='eye'){
 if(!finite(raw))throw Error('サーバーの位置が不正です');bot.positionFrames??={};const remembered=bot.positionFrames[kind]||defaultFrame;const eye=new Vec3(raw.x,raw.y-1.62,raw.z),feet=new Vec3(raw.x,raw.y,raw.z);let frame=remembered,reason='従来の座標基準';
 const preferred=frame==='eye'?eye:feet,alternate=frame==='eye'?feet:eye,a=inspect(bot,preferred),b=inspect(bot,alternate);
 // Switch only when actual received terrain proves that the first reading
 // puts the body in a solid floor and the alternate is a supported clear pose.
 if((a.overlaps.length||bot.actorPositionContext&&!a.support)&&b.known&&!b.overlaps.length&&b.support){frame=frame==='eye'?'feet':'eye';bot.positionFrames[kind]=frame;reason='受信済み床と照合';}
 const p=frame==='eye'?eye:feet;bot.lastPositionNormalization={kind,raw:{...raw},position:{x:p.x,y:p.y,z:p.z},frame,reason};return p;
}
function guardPenetration(bot){const p=bot.entity?.position;if(!p)return false;const check=inspect(bot,p);if(!check.overlaps.length){bot.collisionState={held:false};return false;}
 // Repair only tiny lateral rounding into a known wall. Never select an exit
 // through a full block or move across unknown space.
 const exits=[];for(const box of check.overlaps)for(const [x,z]of [[box.minX-.3,p.z],[box.maxX+.3,p.z],[p.x,box.minZ-.3],[p.x,box.maxZ+.3]]){const q=new Vec3(x,p.y,z),distance=q.distanceTo(p);if(distance>0&&distance<=.125){const clear=inspect(bot,q);if(clear.known&&!clear.overlaps.length&&clear.support)exits.push({q,distance});}}
 if(exits.length){exits.sort((a,b)=>a.distance-b.distance);p.x=exits[0].q.x;p.z=exits[0].q.z;bot.entity.velocity.x=bot.entity.velocity.z=0;bot.collisionState={held:false,roundedFromWall:true,distance:exits[0].distance};return false;}
 const top=Math.max(...check.overlaps.map(b=>b.maxY)),depth=top-p.y;const repaired=new Vec3(p.x,top,p.z),clear=inspect(bot,repaired);
 if(depth>0&&depth<=.125&&clear.known&&!clear.overlaps.length){p.y=top;bot.entity.velocity.y=0;bot.entity.onGround=true;bot.collisionState={held:false,roundedToFloor:true,depth};return false;}
 const wasHeld=bot.collisionState?.held;bot.collisionState={held:true,depth,position:{x:p.x,y:p.y,z:p.z},reason:'受信済みブロックと体が重なっています。位置補正待ち'};bot.entity.velocity=new Vec3(0,0,0);bot.clearControlStates?.();if(!wasHeld)bot.emit('collisionBlocked',bot.collisionState);return true;
}
module.exports={serverPosition,guardPenetration,inspect,finite};
