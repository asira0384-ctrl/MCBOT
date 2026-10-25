'use strict';
const fs=require('node:fs'); const path=require('node:path');
const {emptyStats,norm}=require('./util');
function ownerId(value=process.env.DISCORD_OWNER_ID){
 if(value===undefined)return '1343843235252146219';
 const id=value.trim();if(!/^[1-9]\d{16,19}$/.test(id))throw Error('DISCORD_OWNER_IDには操作する本人のDiscordユーザーIDを設定してください');return id;
}
const OWNER=ownerId();
function dataDirectory(env=process.env,cwd=process.cwd()){return path.resolve(env.DATA_DIR||env.RAILWAY_VOLUME_MOUNT_PATH||path.join(cwd,'data'));}
function validState(value){return !!value&&typeof value==='object'&&!Array.isArray(value)&&(!value.bots||typeof value.bots==='object'&&!Array.isArray(value.bots));}
class Store {
 constructor(dir) { this.dir=dir; fs.mkdirSync(dir,{recursive:true,mode:0o700}); this.file=path.join(dir,'state.json');
  let loaded,error;for(const file of [this.file,this.file+'.bak'])if(fs.existsSync(file)){try{const value=JSON.parse(fs.readFileSync(file,'utf8'));if(!validState(value))throw Error('保存データの形式が不正です');loaded=value;if(file!==this.file){if(fs.existsSync(this.file))fs.copyFileSync(this.file,this.file+'.damaged-'+Date.now());fs.copyFileSync(file,this.file);this.recoveredBackup=true;}break;}catch(e){error=e;}}
  if(!loaded&&error)throw Error('設定ファイルを読み込めません。既存データを残して起動を停止しました: '+error.message);
  this.data=Object.assign({schema:1,admins:[],friends:[],enemies:[],bots:{},webAccess:[],logChannel:null},loaded||{});
 }
 bot(id) { return this.data.bots[id]??= {area:null,floor:null,ceiling:319,scaffold:'slime',scaffoldEnabled:true,maxDrop:64,chat:true,autoSupply:true,respawn:true,stats:emptyStats(),session:emptyStats(),owned:{},minedItems:[]}; }
 save() { const tmp=this.file+'.tmp';this.data.savedAt=Date.now();const fd=fs.openSync(tmp,'w',0o600);try{fs.writeFileSync(fd,JSON.stringify(this.data,null,2));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}if(fs.existsSync(this.file))fs.copyFileSync(this.file,this.file+'.bak');fs.renameSync(tmp,this.file); }
 adminAdd(name,xuid) { if (!/^\d{5,20}$/.test(xuid)||/^0+$/.test(xuid)) throw Error('有効なXbox XUIDが必要です'); const old=this.data.admins.find(a=>a.xuid===xuid);if(old)old.name=name;else this.data.admins.push({name,xuid});this.save(); }
 authorized(packet,players) { if(packet.type!=='chat'&&packet.type!=='whisper')return false;
  const name=norm(packet.source_name||'');const profile=players.get(name); if(!profile||!packet.xuid||profile.xuid!==String(packet.xuid))return false;
  return this.data.admins.some(a=>norm(a.name)===name&&a.xuid===String(packet.xuid));
 }
}
module.exports={Store,OWNER,ownerId,dataDirectory,validState};
