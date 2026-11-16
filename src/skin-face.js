'use strict';
// Return only the front of the head. Keep the original RGBA skin and login data off the web API.
function face(s){
 const w=Number(s?.width),h=Number(s?.height),raw=s?.data;
 if(!Number.isInteger(w)||w<64||w>512||w%64||![w,w/2].includes(h)||!raw)return '';
 const buf=Buffer.isBuffer(raw)?raw:Buffer.from(raw,typeof raw==='string'?'base64':undefined);
 if(buf.length!==4*w*h)return '';
 const k=w/64,n=8*k,out=Buffer.alloc(n*n*4);
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
 const i=4*((8*k+y)*w+8*k+x),j=i+32*k*4,o=4*(y*n+x),a=buf[j+3]/255,b=buf[i+3]/255*(1-a),t=a+b;
 for(let c=0;c<3;c++)out[o+c]=t?Math.round((buf[j+c]*a+buf[i+c]*b)/t):0;
 out[o+3]=Math.round(t*255);}
 return out.toString('base64');
}
module.exports={face};
