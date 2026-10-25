'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),http=require('node:http');
const {Store,OWNER}=require('../src/store'),access=require('../src/access'),{WebControl}=require('../src/web'),{ControlPanel}=require('../src/panel');
const MEMBER='2343843235252146219',OTHER='3343843235252146219',user={id:MEMBER,username:'helper.user',globalName:'Helper Name',avatar:'a'.repeat(32)};
async function fixture(t){
 const dir=fs.mkdtempSync(os.tmpdir()+'/asira319-'),store=new Store(dir),calls=[],manager={store,names:new Map([[1,'Test Bot']]),workers:new Map(),logs:new Map(),targets:v=>v==='all'?[1]:[Number(v)],execute:async(id,command)=>{calls.push({id,command});return 'ok';}};
 let web=manager.web=new WebControl(manager,{owner:OWNER,env:{}});const server=http.createServer((req,res)=>web.handle(req,res));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;web.base=base;
 t.after(async()=>{web.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));fs.rmSync(dir,{recursive:true,force:true});});
 const request=async(path,{data,cookie,csrf,id='operation-12345'}={})=>fetch(base+path,{method:data?'POST':'GET',headers:{Origin:base,...(data?{'Content-Type':'application/json','X-Request-Id':id}:{}),...(cookie?{Cookie:cookie}:{}),...(csrf?{'X-CSRF-Token':csrf}:{})},...(data?{body:JSON.stringify(data)}:{})});
 async function exchange(code,extra={}){const response=await request('/api/login',{data:{code,...extra}}),value=await response.json();return {response,value,cookie:response.headers.get('set-cookie')?.split(';')[0],csrf:value.csrf};}
 return {store,manager,calls,request,exchange,get web(){return web;},restart(){web.close();manager.store=new Store(dir);web=manager.web=new WebControl(manager,{owner:OWNER,env:{},baseURL:base});return web;}};
}
function interaction(actor,command,{action='add',target=user,messageId='message-'+actor.id,customId}={}){
 const replies=[],shared=[],i={user:actor,commandName:command,customId,message:{id:messageId},options:{getSubcommand:()=>action,getUser:name=>name==='user'?target:null,getString:()=>null},isAutocomplete:()=>false,isChatInputCommand:()=>!!command,isModalSubmit:()=>false,deferReply:async data=>{i.flags=data.flags;i.deferred=true;},deferUpdate:async()=>{i.deferred=true;},editReply:async data=>{replies.push(data);return {id:messageId};},followUp:async data=>{shared.push(data);return {id:'shared-entry'};},reply:async data=>{replies.push(data);i.replied=true;}};return {i,replies,shared};
}
test('the actual Discord handler grants once, posts safe entry buttons, opens member panel and logs member into Web without OAuth setup',async t=>{
 const f=await fixture(t),discord=require('discord.js'),before=process.env.DISCORD_TOKEN;process.env.DISCORD_TOKEN='local-test';t.after(()=>{if(before===undefined)delete process.env.DISCORD_TOKEN;else process.env.DISCORD_TOKEN=before;});t.mock.method(discord.Client.prototype,'login',async()=> 'local');const client=await require('../src/discord').startDiscord(f.manager);t.after(()=>client.destroy());const dispatch=client.listeners('interactionCreate')[0];
 const grant=interaction({id:OWNER,username:'Asira'},'admin');await dispatch(grant.i);assert.equal(grant.i.flags,64);assert.match(grant.replies.at(-1).content,/すぐ使えます/);assert.equal(grant.shared.length,1);assert.equal(grant.shared[0].flags,0);const publicText=JSON.stringify(grant.shared[0]);assert(!publicText.includes('#login='));assert(!publicText.includes('DISCORD_CLIENT_SECRET'));const buttons=grant.shared[0].components[0].toJSON().components.map(b=>b.custom_id);assert(buttons.includes('acb:open'));assert(buttons.includes('acb:web-open'));
 assert.equal(access.operator(new Store(f.store.dir),MEMBER),true);assert.equal(f.web.discordLogin.ready(),false);
 const panel=interaction(user,null,{customId:'acb:open'});await dispatch(panel.i);assert.equal(panel.i.flags,64);assert(panel.replies.at(-1).embeds[0].title.includes('Bot管理'));
 const toggle=interaction(user,null,{customId:'acb:toggle:heal'});await dispatch(toggle.i);assert.deepEqual(f.calls.at(-1),{id:'1',command:'heal off'});
 const open=interaction(user,null,{customId:'acb:web-open'});await dispatch(open.i);assert.equal(open.i.flags,64);const link=open.replies.at(-1).content.match(/https?:\/\/[^)]+/u)[0],code=new URL(link).hash.slice(7),session=await f.exchange(code,{discordId:OWNER});assert.equal(session.response.status,200);assert.equal(session.value.profile.id,MEMBER);assert.equal(session.value.profile.name,user.globalName);assert.match(session.value.profile.avatar,new RegExp('/avatars/'+MEMBER+'/'));assert.equal(session.value.isOwner,false);
 const state=await(await f.request('/api/state',session)).json();assert.equal(state.profile.id,MEMBER);assert.equal(state.isOwner,false);assert.equal((await f.request('/api/command',{...session,data:{target:'1',command:'stop'}})).status,200);assert.equal((await f.request('/api/backup',{...session,data:{action:'export',password:'long password 123'}})).status,403);
 const remove=interaction({id:OWNER},'admin',{action:'remove'});await dispatch(remove.i);assert.equal((await f.request('/api/state',session)).status,401);const denied=interaction(user,null,{customId:'acb:open'});await dispatch(denied.i);assert.match(denied.replies[0].content,/管理者/);
});
test('owner and two registered members can hold independent one-use links at the same time',async t=>{
 const f=await fixture(t);access.update(f.store,OWNER,'add',user);access.update(f.store,OWNER,'add',{id:OTHER,username:'other'});const a=f.web.issueLogin(OWNER,'Asira'),b=f.web.issueLogin(MEMBER,'Helper'),c=f.web.issueLogin(OTHER,'Other');for(const [link,id]of [[a,OWNER],[b,MEMBER],[c,OTHER]]){const session=await f.exchange(link.code);assert.equal(session.response.status,200);assert.equal(session.value.profile.id,id);assert.equal((await f.exchange(link.code)).response.status,401);}
});
test('a fresh member link invalidates only that member old link while owner link remains valid',async t=>{
 const f=await fixture(t);access.update(f.store,OWNER,'add',user);const owner=f.web.issueLogin(OWNER),old=f.web.issueLogin(MEMBER),fresh=f.web.issueLogin(MEMBER);assert.equal((await f.exchange(old.code)).response.status,401);assert.equal((await f.exchange(fresh.code)).response.status,200);assert.equal((await f.exchange(owner.code)).response.status,200);
});
test('revocation rejects an unused link, an existing session and the panel immediately',async t=>{
 const f=await fixture(t);access.update(f.store,OWNER,'add',user);const session=await f.exchange(f.web.issueLogin(MEMBER).code),unused=f.web.issueLogin(MEMBER);require('../src/discord-login').grant(f.store,OWNER,'remove',user);assert.equal((await f.exchange(unused.code)).response.status,403);assert.equal((await f.request('/api/state',session)).status,401);assert(!access.operator(f.store,MEMBER));assert(!f.web.isAllowed(MEMBER));
});
test('legacy web-only and panel-only registrations both work and one removal clears both permissions',async t=>{
 const f=await fixture(t);f.store.data.webAccess=[{id:MEMBER,name:'legacy web'}];f.store.data.discordAdmins=[{id:OTHER,name:'legacy panel'}];f.store.save();for(const id of [MEMBER,OTHER]){assert(access.operator(f.store,id));assert.equal((await f.exchange(f.web.issueLogin(id).code)).response.status,200);}access.update(f.store,OWNER,'remove',user);assert(!f.web.isAllowed(MEMBER));assert.equal(f.store.data.webAccess.some(v=>v.id===MEMBER),false);assert.equal(f.store.data.discordAdmins.some(v=>v.id===MEMBER),false);
});
test('member session, identity and saved permission survive a backend restart',async t=>{
 const f=await fixture(t);access.update(f.store,OWNER,'add',user);const session=await f.exchange(f.web.issueLogin(MEMBER,'Helper',user).code);f.restart();const response=await f.request('/api/state',session);assert.equal(response.status,200);const state=await response.json();assert.equal(state.profile.id,MEMBER);assert.equal(state.isOwner,false);assert.equal(state.profile.name,user.globalName);
});
test('unregistered Discord users cannot get links and members cannot grant or remove administrators',async t=>{
 const f=await fixture(t);assert.throws(()=>f.web.issueLogin(MEMBER),e=>e.status===403);access.update(f.store,OWNER,'add',user);const before=JSON.stringify(f.store.data);for(const action of ['add','remove'])assert.throws(()=>access.update(f.store,MEMBER,action,{id:OTHER}),/本人/);assert.equal(JSON.stringify(f.store.data),before);const panel=new ControlPanel(f.manager,OWNER),deny=interaction({id:OTHER},null,{customId:'acb:web-open'});await panel.handle(deny.i);assert.match(deny.replies[0].content,/管理者/);assert.equal(f.web.codes.size,0);
});
test('a failed permission save rolls back both access lists',async t=>{
 const f=await fixture(t),before=JSON.stringify(f.store.data);t.mock.method(f.store,'save',()=>{throw Error('disk full');});assert.throws(()=>access.update(f.store,OWNER,'add',user),/disk full/);assert.equal(JSON.stringify(f.store.data),before);assert(!f.web.isAllowed(MEMBER));
});
test('a missing shared-message permission still leaves the registered member able to open panel and Web',async t=>{
 const f=await fixture(t),panel=new ControlPanel(f.manager,OWNER),grant=interaction({id:OWNER},'admin');grant.i.followUp=async()=>{throw Error('Missing Permissions');};await require('../src/shared-access').change(grant.i,f.manager,panel,'add',user,OWNER);assert.match(grant.replies.at(-1).content,/登録しました/);assert.match(grant.replies.at(-1).content,/共有ボタンを置けなかった/);assert(access.operator(f.store,MEMBER));assert.equal((await f.exchange(f.web.issueLogin(MEMBER).code)).response.status,200);
});
