'use strict';
require('./env').loadLocalEnv();
const http=require('node:http');const path=require('node:path');const {Store}=require('./store');const {Manager}=require('./manager');const {startDiscord}=require('./discord');
async function main(){const store=new Store(process.env.DATA_DIR||path.join(process.cwd(),'data'));const manager=new Manager(store);manager.web=new(require('./web').WebControl)(manager);const discord=await startDiscord(manager);manager.web.ready=()=>discord.isReady();
 const server=http.createServer((req,res)=>manager.web.handle(req,res));server.listen(Number(process.env.PORT||3000),'0.0.0.0');
 let closing=false;const shutdown=async()=>{if(closing)return;closing=true;try{manager.web.close();await manager.shutdown();}finally{discord.destroy();server.close();setTimeout(()=>process.exit(0),500).unref();}};process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
}
main().catch(e=>{console.error(e.message);process.exit(1);});
