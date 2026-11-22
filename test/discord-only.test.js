const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {WebControl}=require('../src/web'),{OWNER}=require('../src/store');
test('browser OAuth approval transfers identity to app, retries keep cookie, codes cannot sign in',async t=>{
 const data={bots:{}},store={data,save(){},bot(id){return data.bots[id]??={};}};
 const manager={store,names:new Map([[21,'Bot21'],[50,'Bot50']]),workers:new Map(),targets:t=>[Number(t)]};
 const web=new WebControl(manager,{env:{DISCORD_CLIENT_ID:'123',DISCORD_CLIENT_SECRET:'fake-test-secret'},fetch:async url=>({ok:true,json:async()=>url.includes('/token')?{access_token:'test-only'}:{id:OWNER,username:'Test'}})});
 const server=http.createServer((q,s)=>web.handle(q,s));await new Promise(r=>server.listen(0,'127.0.0.1',r));const address='http://127.0.0.1:'+server.address().port;
 t.after(()=>{web.close();server.closeAllConnections();server.close();});
 const req=(path,{data,cookie,csrf}={})=>fetch(address+path,{method:data?'POST':'GET',redirect:'manual',headers:{'Content-Type':'application/json',Origin:web.base,...(cookie?{Cookie:cookie}:{}),...(csrf?{'X-CSRF-Token':csrf}:{}),'X-Request-Id':require('crypto').randomUUID()},body:data?JSON.stringify(data):undefined});
 assert.equal((await req('/api/login',{data:{code:'OLD-CODE'}})).status,410);
 const start=await(await req('/api/native/start',{data:{}})).json();assert(start.secret);
 const oauth=await req('/api/oauth/start?native='+start.id);assert.equal(oauth.status,302);
 const state=new URL(oauth.headers.get('location')).searchParams.get('state');const binding=oauth.headers.getSetCookie()[0].split(';')[0];
 const callback=await req('/oauth/discord/callback?code=mock&state='+state,{cookie:binding});assert.equal(callback.status,302);
 const browserCookie=callback.headers.getSetCookie().find(x=>x.startsWith('asira_session=')).split(';')[0];
 const identity=await(await req('/api/native/identity',{cookie:browserCookie})).json();
 const approve=await req('/api/native/approve',{cookie:browserCookie,csrf:identity.csrf,data:{id:start.id}});assert.equal(approve.status,200);
 const bad=await req('/api/native/poll',{data:{id:start.id,secret:'wrong'}});assert.equal(bad.status,401);
 const poll=await req('/api/native/poll',{data:{id:start.id,secret:start.secret}}),result=await poll.json();assert.equal(result.pending,false);assert.equal(result.unlocked,true);
 const appCookie=poll.headers.getSetCookie().find(x=>x.startsWith('asira_session=')).split(';')[0];
 const access=await req('/api/desktop/access',{cookie:appCookie});assert.equal(access.status,200);assert.equal((await access.json()).profile.id,OWNER);
 const retry=await req('/api/native/poll',{data:{id:start.id,secret:start.secret}});assert.equal(retry.status,200);assert.equal(retry.headers.getSetCookie().find(x=>x.startsWith('asira_session=')).split(';')[0],appCookie);
 const attempts=[];manager.requestConnection=id=>(attempts.push(['connect',id]),{state:'pending'});manager.reauthenticate=id=>(attempts.push(['fresh',id]),{state:'pending'});manager.authStatus=()=> 'Waiting for Microsoft sign-in';
 for(const id of [21,50]){const response=await req('/api/desktop/auth',{cookie:appCookie,csrf:result.csrf,data:{target:String(id),fresh:id===50}});assert.equal(response.status,200);}
 assert.deepEqual(attempts,[['connect',21],['fresh',50]]);
 assert.deepEqual(web.targets('21'),[21]);assert.deepEqual(web.targets('50'),[50]);assert.throws(()=>web.targets('51'));
});
