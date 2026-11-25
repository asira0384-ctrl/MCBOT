'use strict';
const fs=require('node:fs'); const path=require('node:path');
const {emptyStats,norm}=require('./util');
const OWNER='1343843235252146219';
class Store {
 constructor(dir) { this.dir=dir; fs.mkdirSync(dir,{recursive:true,mode:0o700}); this.file=path.join(dir,'state.json');
  this.data=fs.existsSync(this.file)?JSON.parse(fs.readFileSync(this.file,'utf8')):{schema:1,admins:[],bots:{},logChannel:null};
 }
 bot(id) { return this.data.bots[id]??= {area:null,floor:null,ceiling:319,scaffold:'slime',chat:true,autoSupply:true,respawn:true,stats:emptyStats(),session:emptyStats(),owned:{},minedItems:[]}; }
 save() { const tmp=this.file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(this.data,null,2),{mode:0o600}); fs.renameSync(tmp,this.file); }
 adminAdd(name,xuid) { if (!/^\d{5,20}$/.test(xuid)||/^0+$/.test(xuid)) throw Error('有効なXbox XUIDが必要です'); const old=this.data.admins.find(a=>a.xuid===xuid);if(old)old.name=name;else this.data.admins.push({name,xuid});this.save(); }
 authorized(packet,players) { if(packet.type!=='chat'&&packet.type!=='whisper')return false;
  const name=norm(packet.source_name||'');const profile=players.get(name); if(!profile||!packet.xuid||profile.xuid!==String(packet.xuid))return false;
  return this.data.admins.some(a=>norm(a.name)===name&&a.xuid===String(packet.xuid));
 }
}
module.exports={Store,OWNER};
