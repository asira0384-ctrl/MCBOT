'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function valid(row,owner,now){return row?.owner===owner&&/^[a-f0-9]{64}$/u.test(row.key)&&typeof row.csrf==='string'&&row.csrf.length>=20&&Number.isFinite(row.expires)&&row.expires>now;}
class WebSessions{
 constructor(store,owner,now=Date.now){this.store=store;this.owner=owner;this.now=now;this.file=store.dir?path.join(store.dir,'web-sessions.json'):null;this.memory={version:1,sessions:store.data.webSessions||[],revoked:{}};}
 read(){if(!this.file)return this.memory;for(const file of [this.file,this.file+'.bak']){try{const value=JSON.parse(fs.readFileSync(file,'utf8'));if(value.version===1&&Array.isArray(value.sessions)&&value.revoked&&typeof value.revoked==='object')return value;}catch{}}return this.memory;}
 rows(){const data=this.read(),now=this.now();return data.sessions.filter(row=>valid(row,this.owner,now)&&!data.revoked[row.key]);}
 find(key){return this.rows().find(row=>row.key===key);}
 revoked(key){return !!this.read().revoked[key];}
 save(rows,revocations=[]){
  const now=this.now(),previous=this.read(),revoked=Object.fromEntries(Object.entries(previous.revoked).filter(([,until])=>Number(until)>now));
  for(const key of revocations)revoked[key]=Math.max(now+90*86400000,previous.sessions.find(row=>row.key===key)?.expires||0);
  const merged=new Map();for(const row of [...previous.sessions,...rows])if(valid(row,this.owner,now)&&!revoked[row.key]){const old=merged.get(row.key);merged.set(row.key,old&&old.expires>row.expires?old:row);}
  const sessions=[...merged.values()].sort((a,b)=>b.expires-a.expires).slice(0,60);this.memory={version:1,sessions,revoked};
  if(this.file){fs.mkdirSync(path.dirname(this.file),{recursive:true,mode:0o700});const temporary=this.file+'.'+crypto.randomUUID()+'.tmp',fd=fs.openSync(temporary,'w',0o600);try{fs.writeFileSync(fd,JSON.stringify(this.memory));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}if(fs.existsSync(this.file))fs.copyFileSync(this.file,this.file+'.bak');fs.renameSync(temporary,this.file);}
  return sessions;
 }
}
module.exports={WebSessions};
