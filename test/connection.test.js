'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const EventEmitter=require('node:events');const bedrock=require('bedrock-protocol');const {Store}=require('../src/store');const {Manager}=require('../src/manager');
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
