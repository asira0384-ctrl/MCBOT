'use strict';
const crypto=require('node:crypto');
function settings(s){return {enabled:false,suffix:' | Asira',fancy:false,green:false,random:false,min:4,max:8,whisper:false,...s.chatSuffix};}
function apply(s,text,privateMessage=false){const c=settings(s);if(!c.enabled||privateMessage&&!c.whisper)return text;let msg=String(text);if(c.fancy)msg=msg.replace(/[A-Za-z]/g,x=>String.fromCodePoint(x.charCodeAt(0)+0xFEE0));let tail=c.suffix;if(c.random){let n=crypto.randomInt(c.min,c.max+1);tail+=' '+Array.from({length:n},()=>String.fromCharCode(97+crypto.randomInt(26))).join('');}const prefix=c.green?'> ':'';let result=prefix+[...msg].slice(0,Math.max(0,220-prefix.length-[...tail].length)).join('')+tail;while(result.length>220&&msg.length){msg=[...msg].slice(0,-1).join('');result=prefix+msg+tail}return result.slice(0,220);}
module.exports={settings,apply};
