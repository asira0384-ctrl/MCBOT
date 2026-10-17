'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const allowed=new Set(['msal','live','sisu','xbl','bed','mca','mcs','pfb']);
class AtomicCache{
 constructor(file){this.cacheLocation=file;}
 load(){if(this.cache!==undefined)return this.cache;let broken=false;for(const file of [this.cacheLocation,this.cacheLocation+'.bak']){if(!fs.existsSync(file))continue;try{const data=JSON.parse(fs.readFileSync(file,'utf8'));if(!data||typeof data!=='object'||Array.isArray(data))throw Error();this.cache=data;if(file!==this.cacheLocation)this.write(data,false);return data;}catch{broken=true;}}if(broken)throw Error('保存した認証情報が破損しています。暗号化バックアップから復元してください');this.cache={};return this.cache;}
 write(data,backup=true){fs.mkdirSync(path.dirname(this.cacheLocation),{recursive:true,mode:0o700});const temp=this.cacheLocation+'.tmp-'+crypto.randomUUID(),fd=fs.openSync(temp,'w',0o600);try{fs.writeFileSync(fd,JSON.stringify(data));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}try{if(backup&&fs.existsSync(this.cacheLocation)){fs.copyFileSync(this.cacheLocation,this.cacheLocation+'.bak');fs.chmodSync(this.cacheLocation+'.bak',0o600);}fs.renameSync(temp,this.cacheLocation);fs.chmodSync(this.cacheLocation,0o600);}finally{fs.rmSync(temp,{force:true});}this.cache=data;}
 async getCached(){return this.load();}
 async setCached(data){this.write(data);}
 async setCachedPartial(data){this.write({...this.load(),...data});}
 async reset(){this.write({});return this.cache;}
}
function factory(directory){return ({cacheName,username})=>{if(!allowed.has(cacheName))throw Error('認証キャッシュの種類が不正です');const hash=crypto.createHash('sha1').update(username,'binary').digest('hex').slice(0,6);return new AtomicCache(path.join(directory,hash+'_'+cacheName+'-cache.json'));};}
function options(){const {Titles}=require('prismarine-auth');return {flow:'live',authTitle:Titles.MinecraftNintendoSwitch,deviceType:'Nintendo',deviceOS:12};}
module.exports={AtomicCache,factory,options};
