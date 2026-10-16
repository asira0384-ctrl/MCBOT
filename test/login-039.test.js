'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),EventEmitter=require('node:events');
const bedrock=require('bedrock-protocol'),{Store}=require('../src/store'),{Manager}=require('../src/manager'),UI=require('../web/ui-state');
function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'asira-login039-')),m=new Manager(new Store(dir)),clients=[],flows=[],original=bedrock.createClient;
 class Flow{
  constructor(username,directory,options,code){Object.assign(this,{directory,code,msa:{}});flows.push(this);}
  getMinecraftBedrockToken(){this.code({user_code:'DEVICE-'+flows.length,expires_in:600});return new Promise((resolve,reject)=>{this.reject=reject;this.finish=name=>{fs.mkdirSync(this.directory,{recursive:true});fs.writeFileSync(path.join(this.directory,'user_live-cache.json'),JSON.stringify({token:{refresh_token:'PRIVATE-CREDENTIAL'}}));const payload=Buffer.from(JSON.stringify({extraData:{displayName:name}})).toString('base64url');resolve({chain:['first','header.'+payload+'.signature']});};});}
 }
 m.accounts.Flow=Flow;m.accounts.run=(_scope,fn)=>fn();m.onNotice=()=>{};
 bedrock.createClient=options=>{const c=new EventEmitter();c.options={...options,version:'1.26.51'};c.queue=()=>{};c.disconnect=()=>{};c.close=()=>{if(c._closed)return;c._closed=true;c.emit('close');};clients.push(c);return c;};
 t.after(()=>{m.destroy();bedrock.createClient=original;fs.rmSync(dir,{recursive:true,force:true});});
 return {dir,m,clients,flows};
}
async function after(){await new Promise(resolve=>setImmediate(resolve));}
test('a delayed device login connects automatically once, repeated clicks keep the same code, and spawn stays provisional',async t=>{
 const {m,flows,clients}=fixture(t);let state=m.requestConnection(2);assert.equal(state.state,'waiting');assert(state.autoConnect);assert.equal(clients.length,0);const code=state.code.value;m.requestConnection(2);assert.equal(flows.length,1);assert.equal(m.authentication(2).code.value,code);
 const pending=m.connectRequests.get(2).promise;flows[0].finish(m.names.get(2));await pending;assert.equal(clients.length,1);assert.equal(m.authentication(2).connection.state,'connecting');m.requestConnection(2);assert.equal(clients.length,1);
 const c=clients[0];c.profile={name:m.names.get(2)};c.emit('session');assert.match(m.authentication(2).connection.phase,/UDP/);c.emit('loggingIn');assert.match(m.authentication(2).connection.phase,/サーバーログイン/);c.emit('join');
 c.startGameData={runtime_entity_id:2n,player_position:{x:128,y:70,z:128},rotation:{x:0,y:0},dimension:0};c.emit('start_game',c.startGameData);m.workers.get(2).bot.physicsEnabled=false;c.emit('spawn');state=m.authentication(2);assert.equal(state.connection.state,'spawned');assert.match(UI.loginView(state).connectionLabel,/本ワールド到着は未確認/);assert(!JSON.stringify(state).includes('PRIVATE-CREDENTIAL'));
});
test('cancel during device login prevents a late completion from joining; account switching cancels the old login too',async t=>{
 const {m,flows,clients}=fixture(t);m.requestConnection(1);const first=m.connectRequests.get(1).promise;await m.execute('1','disconnect');flows[0].finish(m.names.get(1));await first;assert.equal(clients.length,0);assert.equal(m.authentication(1).connection.state,'cancelled');
 m.requestConnection(2);const second=m.connectRequests.get(2).promise;const name=m.names.get(2);await m.execute('2','account set New Account');flows[1].finish(name);await second;assert.equal(clients.length,0);assert.equal(m.names.get(2),'New Account');assert.equal(m.authentication(2).code,null);
});
test('authentication failure never creates a game client and retry starts a fresh attempt',async t=>{
 const {m,flows,clients}=fixture(t);m.requestConnection(1);const first=m.connectRequests.get(1).promise;flows[0].reject(Error('Xbox authentication rejected'));await first;let status=m.authentication(1);assert.equal(clients.length,0);assert.equal(status.connection.state,'failed');assert.match(UI.loginView(status).error,/Xbox authentication rejected/);
 status=m.requestConnection(1);assert.equal(flows.length,2);assert(status.code);const second=m.connectRequests.get(1).promise;flows[1].finish(m.names.get(1));await second;assert.equal(clients.length,1);
});
test('a wrong authenticated gamer tag cannot auto-connect',async t=>{
 const {m,flows,clients}=fixture(t);m.requestConnection(1);const pending=m.connectRequests.get(1).promise;flows[0].finish('Someone Else');await pending;assert.equal(clients.length,0);assert.equal(m.authentication(1).connection.state,'failed');assert.match(m.authentication(1).connection.error,/アカウントが違います/);assert(!m.authentication(1).saved);
});
test('post-auth UDP errors are shown after disconnect and a retry reuses credentials without another device code',async t=>{
 const {m,flows,clients}=fixture(t);m.requestConnection(1);flows[0].finish(m.names.get(1));await m.connectRequests.get(1).promise;const c=clients[0];c.profile={name:m.names.get(1)};c.emit('session');c.emit('error',Error('Connect timed out'));await after();let status=m.authentication(1);assert(c._closed);assert.equal(status.connection.state,'failed');assert.match(status.connection.phase,/UDP/);assert.match(status.connection.error,/19132/);assert.match(UI.loginView(status).title,/失敗/);assert(!UI.loginView(status).busy);
 m.requestConnection(1);await m.connectRequests.get(1).promise;assert.equal(flows.length,1);assert.equal(clients.length,2);status=m.authentication(1);assert.equal(status.connection.state,'connecting');assert.equal(status.connection.error,null);
});
test('expired pending device code can be replaced without waiting for the fifteen minute watchdog',async t=>{
 const {m,flows,clients}=fixture(t);t.mock.timers.enable({apis:['Date'],now:1000000});m.requestConnection(1);const first=m.connectRequests.get(1).promise;t.mock.timers.tick(601000);assert.equal(m.authentication(1).state,'expired');m.requestConnection(1);assert.equal(flows.length,2);const second=m.connectRequests.get(1).promise;flows[0].finish(m.names.get(1));await first;assert.equal(clients.length,0);flows[1].finish(m.names.get(1));await second;assert.equal(clients.length,1);
});
test('a persistence warning never turns an unconnected Microsoft login into a successful Minecraft entry',()=>{
 const auth={state:'ready',saved:true,profile:'Aslrq2nd',storage:{persistent:false},connection:{state:'offline',phase:'Minecraftには未接続',error:null}};const view=UI.loginView(auth);assert.match(view.title,/未接続/);assert(view.canConnect);assert(!view.busy);assert(!view.title.includes('入れます'));
 auth.connection={state:'failed',phase:'サーバーログイン中',error:'Unsupported protocol'};assert.match(UI.loginView(auth).error,/Unsupported protocol/);assert(UI.loginView(auth).canConnect);
});

test('a connection report includes failed pre-game authentication without exposing a device code or credential',async t=>{
 const {m,flows}=fixture(t);m.requestConnection(1);let report=m.connectionDiagnostic(1);assert(report.codePending);assert(!JSON.stringify(report).includes('DEVICE-'));const pending=m.connectRequests.get(1).promise;flows[0].reject(Error('Xbox rejected'));await pending;report=m.connectionDiagnostic(1);assert.equal(report.connection.state,'failed');assert.match(report.connection.error,/Xbox rejected/);assert(!m.workers.has(1));
 const {ControlPanel}=require('../src/panel');const diagnostic=new ControlPanel(m,'owner').diagnostic({target:'1'});assert.equal(diagnostic.bots[0].authentication.connection.state,'failed');assert(!JSON.stringify(diagnostic).includes('PRIVATE-CREDENTIAL'));
});
