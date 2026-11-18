'use strict';
const crypto=require('node:crypto'),{promisify}=require('node:util'),scrypt=promisify(crypto.scrypt);
const fail=(s,m)=>Object.assign(Error(m),{status:s});
const attempts=new Map(),busy=new Set();
function user(s){return String(s.discordId||s.owner);}
function status(w,s){return {setup:!w.manager.store.data.desktopPasswords?.[user(s)],unlocked:s.desktopUnlocked===true,profile:w.publicProfile(s),csrf:s.csrf};}
function lock(w,s){if(!w.isAllowed(user(s)))throw fail(403,'Discord bot access is not permitted');if(s.desktopUnlocked!==true)throw fail(401,'DESKTOP_LOCKED');}
async function password(w,s,d){
 const id=user(s);if(!w.isAllowed(id))throw fail(403,'Access is not permitted');const key=s.key;
 if(busy.has(id))throw fail(429,'Password verification is in progress');
 if(typeof d.password!=='string'||d.password.length<8||d.password.length>128)throw fail(400,'Password must contain 8 to 128 characters');
 const saved=w.manager.store.data.desktopPasswords?.[id],old=attempts.get(id),now=w.now();
 if(old&&old.until>now&&old.count>=5)throw fail(429,'Too many attempts. Try again in five minutes');
 if(!['setup','unlock'].includes(d.action)||d.action==='setup'&&saved||d.action==='unlock'&&!saved)throw fail(409,'Refresh the sign-in screen');
 busy.add(id);
 try{
 if(!saved){const salt=crypto.randomBytes(16).toString('hex'),hash=await scrypt(d.password,salt,64,{N:16384,r:8,p:1});w.manager.store.data.desktopPasswords??={};w.manager.store.data.desktopPasswords[id]={salt,hash:hash.toString('hex')};try{w.manager.store.save();}catch(e){delete w.manager.store.data.desktopPasswords[id];throw e;}}
 else{const hash=await scrypt(d.password,saved.salt,64,{N:16384,r:8,p:1}),expected=Buffer.from(saved.hash,'hex');if(expected.length!==hash.length||!crypto.timingSafeEqual(hash,expected)){attempts.set(id,{count:old&&old.until>now?old.count+1:1,until:old&&old.until>now?old.until:now+300000});throw fail(401,'Incorrect password');}}
 if(!w.isAllowed(id)||!w.sessions.has(key))throw fail(401,'Please sign in again');
 attempts.delete(id);s.desktopUnlocked=true;w.sessions.get(key).desktopUnlocked=true;return status(w,s);
 }finally{busy.delete(id)}
}
module.exports={status,password,lock};
