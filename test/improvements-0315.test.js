'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const {Store,OWNER}=require('../src/store'),{WebControl}=require('../src/web'),{ConnectionKeeper}=require('../src/connection-keeper');
function disk(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'asira-315-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return new Store(dir);}
async function webFixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'asira-web315-')),store=new Store(dir);let now=Date.now(),current;const bot={connected:true,config:{host:'local',port:19132},players:new Map(),items:[],armor:[],offhand:[],packetCounts:{},health:20,disconnect(){this.connected=false;}};
 const manager={store,names:new Map([[1,'One']]),workers:new Map([[1,{bot,mode:'stopped'}]]),logs:new Map(),targets:v=>v==='all'?[1]:[Number(v)]};
 const web=new WebControl(manager,{env:{},now:()=>now});current=web;const server=http.createServer((req,res)=>current.handle(req,res));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;web.base=origin;
 t.after(async()=>{current.close();if(current!==web)web.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));fs.rmSync(dir,{recursive:true,force:true});});
 async function request(url,session,data){const headers={};if(session?.cookie)headers.Cookie=session.cookie;if(data!==undefined)Object.assign(headers,{'Content-Type':'application/json',Origin:origin,'X-CSRF-Token':session?.csrf||'','X-Request-Id':crypto.randomUUID()});return fetch(origin+url,{method:data===undefined?'GET':'POST',headers,body:data===undefined?undefined:JSON.stringify(data)});}
 async function login(){const code=current.issueLogin(OWNER,'Test owner').code,response=await request('/api/login',null,{code}),value=await response.json();assert.equal(response.status,200,JSON.stringify(value));return {cookie:response.headers.get('set-cookie').split(';')[0],csrf:value.csrf};}
 function oauth(){let cookies;const session=current.createSession({headers:{host:origin},socket:{}},{getHeader(){return null;},setHeader(name,value){cookies=value;}},{id:OWNER,name:'OAuth owner',username:'Owner',avatar:null});return {cookie:cookies.find(c=>c.startsWith('asira_session=')).split(';')[0],csrf:session.csrf};}
 return {web,manager,store,bot,request,login,oauth,origin,advance:ms=>now+=ms,restart(){current.close();current=new WebControl({...manager,store:new Store(dir)},{env:{},now:()=>now,baseURL:origin});return current;}};
}
test('World defaults and packet whitelist use /world cpe and reject the old dotted command',async t=>{
 const {b,packets}=require('./helpers/adapter').adapter(t);b.world();assert.equal(packets.at(-1).params.command,'/world cpe');assert.equal(packets.at(-1).name,'command_request');assert.throws(()=>b.command('/.world cpe'),/許可/);const {IgnActions}=require('../src/ign-actions'),{EventEmitter}=require('node:events'),sent=[],bot=Object.assign(new EventEmitter(),{config:{realm:'ign'},command:c=>sent.push(c)}),r={bot,worker:{state:{ignActions:{worldName:'coe'}}},notice(){}};const actions=new IgnActions(r);actions.send('world');assert.deepEqual(sent,['/world cpe']);actions.destroy();
});
test('no Minecraft IDs in environment starts an empty saved fleet, then Web-added names survive without variables',t=>{
 const slots=require('../src/account-slots'),store=disk(t);assert.equal(slots.load(store,{}).size,0);const manager={store,names:new Map()};const account=slots.add(manager,'Asira Example','ign');assert.equal(account.id,1);assert.equal(slots.load(new Store(store.dir),{}).get(1),'Asira Example');assert.equal(new Store(store.dir).bot(1).serverRealm,'ign');
});
test('old verified profiles and optional legacy environment names migrate once without reintroducing defaults',t=>{
 const slots=require('../src/account-slots'),store=disk(t);store.bot(2).authAccounts={old:{name:'Old Profile',verifiedAt:100},new:{name:'Latest Profile',verifiedAt:200}};store.bot(4).accountName='Saved Name';let names=slots.load(store,{BOT_NAMES:'Environment One'});assert.equal(names.get(2),'Latest Profile');assert.equal(names.get(4),'Saved Name');assert.equal(names.get(1),'Environment One');names=slots.load(new Store(store.dir),{});assert.equal(names.size,3);assert.equal(names.has(11),false);
});
test('logging in twice preserves both browser sessions; closing a stream does not disconnect Minecraft',async t=>{
 const f=await webFixture(t),first=f.oauth(),second=f.oauth();assert.equal((await f.request('/api/state',first)).status,200);assert.equal((await f.request('/api/state',second)).status,200);const response=await f.request('/api/events',first),reader=response.body.getReader();await reader.read();await reader.cancel();assert.equal(f.bot.connected,true);assert.equal((await f.request('/api/state',first)).status,200);
});
test('a saved Web session survives controller replacement and the cookie is persistent and HttpOnly',async t=>{
 const f=await webFixture(t),session=await f.login();const filename=path.join(f.store.dir,'web-sessions.json');assert(fs.existsSync(filename));assert.equal(fs.statSync(filename).mode&0o777,0o600);assert(!fs.readFileSync(filename,'utf8').includes(session.cookie.split('=')[1]));f.restart();const response=await f.request('/api/state',session);assert.equal(response.status,200);assert.equal((await response.json()).profile.id,OWNER);assert.equal(f.bot.connected,true);
});
test('restarting HTTP controller answers 503 rather than falsely expiring a valid login',async t=>{
 const f=await webFixture(t),session=await f.login();f.web.close();assert.equal((await f.request('/')).status,200);let response=await f.request('/api/state',session);assert.equal(response.status,503);assert.equal((await response.json()).code,'RESTARTING');assert.equal((await f.request('/health')).status,503);f.restart();response=await f.request('/api/state',session);assert.equal(response.status,200);
});
test('active sessions extend their cookie without another Discord login',async t=>{
 const f=await webFixture(t),session=await f.login();f.advance(9*86400000);const response=await f.request('/api/state',session);assert.equal(response.status,200);const cookie=response.headers.get('set-cookie');assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Lax/);assert.match(cookie,/Max-Age=2592000/);assert.match(cookie,/Expires=/);f.advance(25*86400000);assert.equal((await f.request('/api/state',session)).status,200);
});
test('stale controllers merge new sessions and cannot resurrect an explicitly logged-out session',t=>{
 const {WebSessions}=require('../src/web-sessions'),store=disk(t),first=new WebSessions(store,OWNER),second=new WebSessions(new Store(store.dir),OWNER),now=Date.now(),row=n=>({key:String(n).repeat(64),owner:OWNER,discordId:OWNER,csrf:'x'.repeat(30),expires:now+86400000});first.save([row(1)]);second.save([row(2)]);first.save([row(1)]);assert.equal(new WebSessions(new Store(store.dir),OWNER).rows().length,2);second.save([],['1'.repeat(64)]);first.save([row(1)]);const restarted=new WebSessions(new Store(store.dir),OWNER);assert.equal(restarted.find('1'.repeat(64)),undefined);assert(restarted.find('2'.repeat(64)));
});
test('logout revokes its own session without stopping Minecraft or invalidating another browser',async t=>{
 const f=await webFixture(t),first=await f.login(),second=await f.login();assert.equal((await f.request('/api/logout',first,{})).status,200);assert.equal((await f.request('/api/state',first)).status,401);assert.equal((await f.request('/api/state',second)).status,200);assert.equal(f.bot.connected,true);f.restart();assert.equal((await f.request('/api/state',first)).status,401);assert.equal((await f.request('/api/state',second)).status,200);
});
test('a changed CSRF token is distinguishable from authorization loss and cannot execute a mutation',async t=>{
 const f=await webFixture(t),session=await f.login(),bad={...session,csrf:'old-token'};const response=await f.request('/api/logout',bad,{});assert.equal(response.status,403);assert.equal((await response.json()).code,'CSRF_STALE');assert.equal((await f.request('/api/state',session)).status,200);
});
function keeperFixture(){const rows=new Map([[1,{connectionWanted:true}],[2,{connectionWanted:false}]]),pending=new Map(),calls=[];let next=0;const manager={store:{bot:id=>rows.get(id),save(){}},names:new Map([[1,'One'],[2,'Two']]),workers:new Map(),accounts:{snapshot:()=>({saved:true,state:'saved'})},connectRequests:new Map(),connectionResults:new Map(),requestConnection(id){calls.push(id);},notice(){}};const keeper=new ConnectionKeeper(manager,{schedule:(fn,delay)=>{const id=++next;pending.set(id,{fn,delay});return id;},cancel:id=>pending.delete(id)});manager.connectionKeeper=keeper;return {manager,keeper,rows,pending,calls,fire:async()=>{const [id,task]=pending.entries().next().value;pending.delete(id);task.fn();await Promise.resolve();await Promise.resolve();}};}
test('service startup restores only previously wanted connections with saved authentication',async()=>{
 const f=keeperFixture();f.keeper.restore();assert.equal(f.pending.size,1);await f.fire();assert.deepEqual(f.calls,[1]);f.keeper.stop();
});
test('manual disconnect and AutoLog intent remain off across an automatic restore',()=>{
 const f=keeperFixture();f.keeper.restore();f.keeper.wanted(1,false,'manual');assert.equal(f.pending.size,0);f.keeper.restore();assert.equal(f.pending.size,0);assert.equal(f.rows.get(1).connectionBlocked,'manual');f.keeper.wanted(1,true);f.keeper.wanted(1,false,'autolog');f.keeper.restore();assert.equal(f.pending.size,0);assert.equal(f.keeper.snapshot(1).blocked,'autolog');f.keeper.stop();
});
test('missing authentication never starts device-code prompts in background and shutdown cancels retries',async()=>{
 const f=keeperFixture();f.manager.accounts.snapshot=()=>({saved:false,state:'required'});f.keeper.restore();await f.fire();assert.deepEqual(f.calls,[]);assert.equal(f.keeper.snapshot(1).phase,'authentication');f.keeper.queue(1);f.keeper.stop();assert.equal(f.pending.size,0);
});
test('a successful rejoin clears backoff and retries stop after six failed attempts',async()=>{
 const f=keeperFixture();f.manager.requestConnection=()=>{throw Error('temporary timeout');};for(let n=0;n<6;n++){f.keeper.queue(1);await f.fire();await new Promise(resolve=>setImmediate(resolve));}assert.equal(f.pending.size,0);assert.equal(f.keeper.snapshot(1).phase,'stopped');f.keeper.connected(1);assert.equal(f.keeper.attempts.has(1),false);assert.equal(f.keeper.snapshot(1).phase,'connected');f.keeper.stop();
});
