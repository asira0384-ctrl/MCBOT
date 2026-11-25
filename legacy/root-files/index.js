'use strict';
const http=require('node:http');const path=require('node:path');const {Store}=require('./store');const {Manager}=require('./manager');const {startDiscord}=require('./discord');
async function main(){const store=new Store(process.env.DATA_DIR||path.join(process.cwd(),'data'));const manager=new Manager(store);const discord=await startDiscord(manager);
 const server=http.createServer((req,res)=>{if(req.url!=='/health'){res.writeHead(404);res.end();return;}res.writeHead(discord.isReady()?200:503,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:discord.isReady()}));});server.listen(Number(process.env.PORT||3000),'0.0.0.0');
 const shutdown=()=>{manager.destroy();discord.destroy();server.close();setTimeout(()=>process.exit(0),500).unref();};process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
}
main().catch(e=>{console.error(e.message);process.exit(1);});
