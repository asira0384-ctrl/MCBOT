'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const EventEmitter=require('node:events');const bedrock=require('bedrock-protocol');const {Store}=require('../src/store');const {Manager}=require('../src/manager');
test('online greeting is sent only once; manual disconnect respects the recent-message cooldown',async t=>{const original=bedrock.createClient,c=new EventEmitter(),events=[];c.options={version:'1.26.51'};c.queue=(n,p)=>{if(n==='text')events.push(p.message);};c.disconnect=()=>{};c.close=()=>{events.push('CLOSE');c.emit('close');};bedrock.createClient=()=>c;const dir=fs.mkdtempSync(os.tmpdir()+'/asira-greet-'),m=new Manager(new Store(dir));t.after(()=>{m.destroy();bedrock.createClient=original;fs.rmSync(dir,{recursive:true,force:true});});await m.connect(1);c.profile={name:m.names.get(1)};c.startGameData={runtime_entity_id:1n,player_position:{x:0,y:65.62,z:0},rotation:{x:0,y:0},dimension:0};c.emit('start_game',c.startGameData);m.workers.get(1).bot.physicsEnabled=false;c.emit('spawn');c.emit('spawn');assert.equal(events.filter(s=>s.startsWith('オンラインになりました！')).length,1);const activeBot=m.workers.get(1).bot;await m.execute('1','disconnect');const bye=events.findIndex(s=>s.startsWith('バイバイ！'));assert.equal(bye,-1);assert(events.includes('CLOSE'));assert.equal(activeBot.chatQueue.pending.length,0);});
test('pending connection retained; disconnect closes pre-auth client; stale code callbacks ignored; auth reports phase',async t=>{
 const original=bedrock.createClient,clients=[],options=[];
 bedrock.createClient=opts=>{options.push(opts);const c=new EventEmitter();c.options={version:'1.26.51'};c.queue=()=>{};c.disconnect=()=>{};c.close=()=>{if(c._closed)return;c._closed=true;c.emit('close');c.removeAllListeners();};clients.push(c);return c;};
 const dir=fs.mkdtempSync(os.tmpdir()+'/asira-connect-');const m=new Manager(new Store(dir));const notices=[];m.onNotice=(id,msg)=>notices.push(msg);
 t.after(()=>{m.destroy();bedrock.createClient=original;fs.rmSync(dir,{recursive:true,force:true});});
 await m.execute('1','connect');assert.match(m.authStatus(1),/Microsoft\/Xbox認証中/);
 options[0].onMsaCode({user_code:'OLD-CODE',expires_in:900});assert.match(m.authStatus(1),/OLD-CODE/);
 await m.execute('1','connect');assert.equal(clients.length,1,'repeated connect must not kill authentication');
 const oldBot=m.workers.get(1).bot;let ends=0;oldBot.on('end',()=>ends++);
 await m.execute('1','disconnect');assert(clients[0]._closed,'disconnect must close even when protocol disconnect is a no-op');assert.equal(ends,1);assert(!m.auth.has(1));
 await m.execute('1','connect');options[0].onMsaCode({user_code:'STALE',expires_in:900});assert(!m.auth.has(1));
 options[1].onMsaCode({user_code:'NEW-CODE',expires_in:900});assert.match(m.authStatus(1),/NEW-CODE/);
 clients[1].emit('session',{});assert(!m.auth.has(1));assert.match(m.authStatus(1),/UDP接続中/);
 clients[1].emit('error',Error('Connect timed out'));clients[1].close();assert.equal(m.workers.get(1).mode,'disconnected');assert.match(m.authStatus(1),/切断済み/);assert(notices.some(s=>s.includes('Microsoft認証後')));
 await m.execute('1','connect');options[1].onMsaCode({user_code:'LATE',expires_in:900});assert(!m.auth.has(1));
});
test('server transfer follows once, messages survive old connection, manual disconnect cancels pending transfer',async t=>{
 const original=bedrock.createClient,clients=[],options=[];
 bedrock.createClient=opts=>{options.push(opts);const c=new EventEmitter();c.options={version:'1.26.51'};c.queue=()=>{};c.disconnect=()=>{};c.close=()=>{if(c._closed)return;c._closed=true;c.emit('close');c.removeAllListeners();};clients.push(c);return c;};
 const dir=fs.mkdtempSync(os.tmpdir()+'/asira-transfer-'),m=new Manager(new Store(dir));t.after(()=>{m.destroy();bedrock.createClient=original;fs.rmSync(dir,{recursive:true,force:true});});
 await m.execute('1','connect');clients[0].emit('text',{type:'system',message:'Welcome. Join queue'});assert.match(await m.execute('1','messages'),/Join queue/);
 clients[0].emit('transfer',{server_address:'destination.example',port:19134});assert(clients[0]._closed);
 await new Promise(r=>setTimeout(r,350));assert.equal(clients.length,2);assert.equal(options[1].host,'destination.example');assert.equal(options[1].port,19134);assert.match(await m.execute('1','messages'),/サーバー転送/);
 clients[1].emit('transfer',{server_address:'next.example',port:19132});await m.execute('1','disconnect');await new Promise(r=>setTimeout(r,350));assert.equal(clients.length,2,'manual disconnect cancels queued reconnection');
 await assert.rejects(m.execute('1','say /join','game'));
});
