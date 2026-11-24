'use strict';

// The offset field names changed from dx/dy/dz to x/y/z in the modern schema.
// Passing the old shape to the new writer silently encodes zero on each axis.
function integer(value,min,max,label){if(!Number.isInteger(value)||value<min||value>max)throw Object.assign(Error('Invalid subchunk '+label),{code:'INVALID_SUBCHUNK_REQUEST'});return value;}
function normalize(bot,p){
 const types=bot.registry?.protocol?.types||{},array=types.packet_subchunk_request?.[1]?.find(f=>f.name==='requests')?.type;
 if(array?.[0]!=='array')throw Error('Subchunk request schema is unavailable');
 let element=array[1].type;if(typeof element==='string')element=types[element];
 const fields=element?.[0]==='container'?element[1].map(f=>f.name):[];
 const modern=['x','y','z'].every(k=>fields.includes(k));
 if(!modern&&!['dx','dy','dz'].every(k=>fields.includes(k)))throw Error('Unsupported subchunk offset schema');
 const dimension=integer(p.dimension,-2147483648,2147483647,'dimension'),origin=Object.fromEntries(['x','y','z'].map(k=>[k,integer(p.origin?.[k],-2147483648,2147483647,'origin '+k)]));
 if(!Array.isArray(p.requests)||p.requests.length>64)throw Error('Invalid subchunk request count');
 const seen=new Set(),requests=[];
 for(const row of p.requests){const values=['x','y','z'].map(k=>integer(row?.[k]??row?.['d'+k],-128,127,'offset '+k)),key=values.join(',');if(seen.has(key))continue;seen.add(key);requests.push(Object.fromEntries(values.map((value,i)=>[(modern?'':'d')+['x','y','z'][i],value])));}
 return {dimension,origin,requests};
}
function bounds(dimension){return dimension===1?{min:0,max:7}:dimension===2?{min:0,max:15}:{min:-4,max:19};}
module.exports={normalize,bounds};
