'use strict';
require('./app/env').loadLocalEnv();
const http=require('node:http');const path=require('node:path');const {Store}=require('../data/store');const {Manager}=require('./app/manager');const {startDiscord}=require('../discord/bot/discord');
async function main(){const directory=require('../data/store').dataDirectory();const store=new Store(directory);console.log('データ保存先: '+directory);const manager=new Manager(store);manager.web=new(require('../web/server/web').WebControl)(manager);const discord=await startDiscord(manager);manager.web.ready=()=>discord.isReady();
 const server=http.createServer((req,res)=>manager.web.handle(req,res));server.listen(830,'0.0.0.0',()=>manager.connectionKeeper.restore());
 let closing=false;const shutdown=async()=>{if(closing)return;closing=true;try{manager.web.close();await manager.shutdown();}finally{discord.destroy();server.close();setTimeout(()=>process.exit(0),500).unref();}};process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
}
main().catch(e=>{console.error(e.message);process.exit(1);});
