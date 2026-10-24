'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {EventEmitter}=require('node:events'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Vec3}=require('vec3'),{adapter}=require('./helpers/adapter'),{Store,OWNER}=require('../src/store');
function store(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'asira-314-'));t.after(()=>fs.rmSync(dir,{force:true,recursive:true}));return new Store(dir);}
const {Manager}=require('../src/manager');

test('opening the inventory can replace every array and stack ID before a real swap',async t=>{
 const {b,c,item,packets}=adapter(t);b.items[0]=item('diamond_sword',10);b.items[12]=item('obsidian',11);const original=c.queue;
 c.queue=(name,p)=>{if(name==='interact')queueMicrotask(()=>{const input=b.items.map(i=>i?{...i,stack_id:i.stack_id+100}:null);c.emit('inventory_content',{window_id:'inventory',input});});return original(name,p);};
 await b.swap(0,12);assert.equal(b.name(b.items[0]),'obsidian');assert.equal(b.name(b.items[12]),'diamond_sword');const action=packets.find(p=>p.name==='item_stack_request').params.requests[0].actions[0];assert.equal(action.source.stack_id,110);assert.equal(action.destination.stack_id,111);assert.equal(b.lastStackResponse.status,'ok');
});
test('a real content change during inventory opening rejects the stale intent before sending a swap',async t=>{
 const {b,c,item,packets}=adapter(t);b.items[0]=item('diamond_sword');b.items[12]=item('obsidian');const original=c.queue;c.queue=(name,p)=>{if(name==='interact')queueMicrotask(()=>{const input=[...b.items];input[0]=item('enchanted_golden_apple');c.emit('inventory_content',{window_id:0,input});});return original(name,p);};
 await assert.rejects(b.swap(0,12),/開く間に所持品が変わりました/);assert.equal(b.name(b.items[0]),'enchanted_golden_apple');assert.equal(packets.filter(p=>p.name==='item_stack_request').length,0);
});
test('inventory_content is a usable acknowledgement on peers that omit container_open',async t=>{
 const {b,c}=adapter(t);c.queue=(name)=>{if(name==='interact')queueMicrotask(()=>c.emit('inventory_content',{window_id:'inventory',input:b.items}));};b.serverAuthoritativeInventory=true;await b.openInventory();assert.equal(b.inventoryOpenState.confirmedBy,'inventory_content');assert.equal(b.inventoryOpenState.acknowledged,true);
});
test('drag tokens survive wire stack-ID renewal and distinguish NBT, counts and item types',()=>{
 const {itemToken}=require('../src/web'),a={network_id:1,count:1,stack_id:3,extra:{nbt:{tag:'a'}}};assert.equal(itemToken(a),itemToken({...a,stack_id:55}));assert.notEqual(itemToken(a),itemToken({...a,count:2}));assert.notEqual(itemToken(a),itemToken({...a,extra:{nbt:{tag:'b'}}}));assert.notEqual(itemToken(a),itemToken({...a,network_id:2}));
});
test('World sends /.world coe through command_request with no public text packet',async t=>{
 const {b,packets}=adapter(t);assert.equal(b.world(),true);const command=packets.find(p=>p.name==='command_request');assert.equal(command.params.command,'/.world coe');assert.equal(packets.filter(p=>p.name==='text').length,0);assert.throws(()=>b.world('coe\n/kill'),/不正/);
});
test('IGN AutoWorld sends a slash command after confirmed respawn and keeps initial spawn quiet',()=>{
 const {IgnActions}=require('../src/ign-actions'),sent=[],b=Object.assign(new EventEmitter(),{connected:true,terrainReady:true,dead:false,config:{realm:'ign'},command:c=>sent.push(c)}),r={bot:b,worker:{id:12,state:{ignActions:{autoWorld:true,worldName:'coe'}}},notice(){}};const actions=new IgnActions(r);b.emit('spawn');assert.equal(actions.queue.length,0);b.emit('respawned');actions.nextAt=0;actions.tick();assert.deepEqual(sent,['/.world coe']);actions.destroy();
});
test('20 slots retain the old IGN number and survive restart and newly added slots',t=>{
 const slots=require('../src/account-slots'),s=store(t),names=slots.load(s,{BOT_NAMES:Array.from({length:19},(_,i)=>'Account '+i).join(','),IGN_BOT_NAME:'IGN Alt'});assert.equal(names.size,20);assert.equal(names.get(11),'IGN Alt');assert.equal(names.get(12),'Account 10');const m={store:s,names};slots.save(m);const reloaded=slots.load(new Store(s.dir),{});assert.deepEqual([...reloaded],[...names]);assert.throws(()=>slots.add(m,'Twenty One'),/20/);
});
test('add account uses the first free slot, persists its realm and starts paused',t=>{
 const slots=require('../src/account-slots'),s=store(t),m={store:s,names:slots.load(s,{BOT_NAMES:'First',IGN_BOT_NAME:'IGN'})};const row=slots.add(m,'Aslrq 1st','ign');assert.equal(row.id,2);assert.equal(s.bot(2).runtimePaused,true);assert.equal(s.bot(2).serverRealm,'ign');assert.equal(slots.load(new Store(s.dir),{}).get(2),'Aslrq 1st');assert.throws(()=>slots.add(m,'ASLRQ 1ST'),/重複/);
});
test('a Discord administrator can use panel and Web, and only the owner grants or revokes this role',async t=>{
 const s=store(t),access=require('../src/access'),login=require('../src/discord-login'),id='123456789012345678';access.update(s,OWNER,'add',{id,username:'Helper'});assert(access.operator(s,id));assert(login.permitted(s,id));assert(access.operator(new Store(s.dir),id));assert.throws(()=>access.update(s,id,'add',{id:'234567890123456789'}),/本人/);
 const manager={store:s},panel=new(require('../src/panel').ControlPanel)(manager,OWNER);let opened=false;panel.create=async()=>{opened=true;};await panel.handle({customId:'acb:open',user:{id},deferReply:async()=>{}});assert(opened);access.update(s,OWNER,'remove',{id});assert.equal(access.operator(s,id),false);assert.equal(login.permitted(s,id),false);
});
test('auth profile lookup searches the signed chain instead of assuming index 1',()=>{
 const {bedrockProfile}=require('../src/accounts'),jwt=value=>'header.'+Buffer.from(JSON.stringify(value)).toString('base64url')+'.signature';assert.deepEqual(bedrockProfile(['broken',jwt({identityPublicKey:'key'}),jwt({extraData:{displayName:'a5lrq'}})]),{name:'a5lrq'});assert.throws(()=>bedrockProfile([jwt({identityPublicKey:'key'})]),/ゲーマータグ/);
});
test('fresh authentication retires only the selected account cache and retains a private backup',t=>{
 const {Accounts}=require('../src/accounts'),s=store(t),accounts=new Accounts(s),one=accounts.directory(1,'Aslrq 1st'),two=accounts.directory(2,'a5lrq');fs.writeFileSync(path.join(one,'test_live-cache.json'),JSON.stringify({token:{refresh_token:'OLD_ONE'}}));fs.writeFileSync(path.join(two,'test_live-cache.json'),JSON.stringify({token:{refresh_token:'KEEP_TWO'}}));assert(accounts.snapshot(1,'Aslrq 1st').saved);accounts.reset(1,'Aslrq 1st');assert.equal(accounts.snapshot(1,'Aslrq 1st').saved,false);assert(accounts.snapshot(2,'a5lrq').saved);assert(fs.readdirSync(path.dirname(one)).some(n=>n.startsWith(path.basename(one)+'.backup-')));accounts.destroy();
});

function mineFixture({x2=1,ceiling=8,filter=[]}={}){
 const b=Object.assign(new EventEmitter(),{connected:true,health:20,dimensionId:0,entity:{position:new Vec3(-2,1,-2)},worldMirror:{request(){}},reach:()=>true,visible:()=>true});const blocks=new Map();b.blockAt=p=>blocks.get(`${p.x},${p.y},${p.z}`)||{name:'air',position:p,isAir:true,solid:false,diggable:false,hardness:0};
 const manager={workers:new Map(),claims:new Map(),assigned:()=>true,store:{save(){}},notice(){}},w={id:1,bot:b,manager,state:{area:{x1:0,z1:0,x2,z2:0},floor:0,ceiling,miningFilter:filter,owned:{},minedItems:[]},failed:new Map(),owned:()=>false,underPlayer:()=>false};manager.workers.set(1,w);w.miner=new(require('../src/mining').ChunkMining)(w);
 const set=(x,y,name='obsidian',z=0)=>{const p=new Vec3(x,y,z);blocks.set(`${x},${y},${z}`,{name,position:p,solid:true,diggable:true,hardness:50});};return {w,b,blocks,set};
}
test('mining finishes a chunk from its highest layer before moving to the next chunk',()=>{
 const {w,set,blocks}=mineFixture({x2:16});set(0,3);set(1,7);set(16,8);let target=w.miner.scan();assert.equal(target.position.y,7);blocks.delete('1,7,0');target=w.miner.scan();assert.equal(target.position.x,0);assert.equal(target.position.y,3);blocks.delete('0,3,0');target=w.miner.scan();assert.equal(target.position.x,16);assert.equal(target.position.y,8);blocks.delete('16,8,0');assert.equal(w.miner.scan(),null);assert.equal(w.miner.done,true);w.miner.destroy();
});
test('a mining filter leaves all other blocks intact and does not mark unknown upper terrain complete',()=>{
 const {w,set,b}=mineFixture({filter:['obsidian']});set(0,8,'stone');set(1,4,'obsidian');assert.equal(w.miner.scan().name,'obsidian');w.miner.reset();const original=b.blockAt;b.blockAt=p=>p.y===8&&p.x===1?null:original(p);assert.equal(w.miner.scan(),null);assert(w.miner.unknown>0);assert.equal(w.miner.done,false);w.miner.destroy();
});
test('a configured worker actually digs the top filtered block without demanding unused scaffolds or food',async t=>{
 const {Worker}=require('../src/worker'),{w:stub,b,set,blocks}=mineFixture({filter:['obsidian']}),state=stub.state;state.stats=require('../src/util').emptyStats();state.session=require('../src/util').emptyStats();state.autoSupply=false;const calls=[];b.tool=()=>({name:'diamond_pickaxe',slot:0});b.find=()=>null;b.list=()=>[];b.halt=()=>{};b.disconnect=()=>{};b.dig=async target=>{calls.push(target);blocks.delete(`${target.position.x},${target.position.y},${target.position.z}`);};stub.manager.store.bot=()=>state;stub.miner.destroy();const w=new Worker(stub.manager,1,b);stub.manager.workers.set(1,w);t.after(()=>w.destroy());set(0,2);set(1,7);set(1,8,'stone');assert.equal(w.start(),true);await w.tick();assert.equal(calls.length,1);assert.equal(calls[0].position.y,7);assert.equal(state.stats.total,1);assert.equal(w.running,true);
});
test('start requests wait for an existing inventory operation and then enter mining instead of being lost',async()=>{
 const {Worker}=require('../src/worker'),{Runtime}=require('../src/runtime'),state={area:{x1:0,z1:0,x2:1,z2:1},floor:0,ceiling:8},w={state,bot:{connected:true,dead:false,terrainReady:true},busy:false,controlBusy:true,miner:{reset(){}},runtime:{worker:{state:{}},follower:{stop(){}},travel:{cancel(){}}}};w.start=Worker.prototype.start;assert.equal(w.start(),false);assert(w.startRequested);w.runtime.paused=false;const r={worker:w,bot:{connected:true,entity:{},loggingOut:false,dead:false},autoLog:{check:async()=>false},ignActions:{tick(){}},busy:false,notice(){}};await Runtime.prototype.tick.call(r);assert.equal(w.running,true);assert.equal(w.startRequested,false);
});
test('mining names support namespace, Japanese and numeric registry block IDs',()=>{
 const registry=require('prismarine-registry')('bedrock_1.26.51'),parse=require('../src/mining').filter;assert.deepEqual(parse('minecraft:obsidian, 黒曜石',registry),['obsidian']);assert.deepEqual(parse(String(registry.blocksByName.obsidian.id),registry),['obsidian']);assert.throws(()=>parse('definitely_not_a_block',registry),/不明/);assert.deepEqual(parse('all',registry),[]);
});
test('nearby chunk order and outside-area block updates preserve the configured mining bounds',()=>{
 const {w,b,set}=mineFixture({x2:31});b.entity.position=new Vec3(20,1,0);set(0,7);set(20,4);const target=w.miner.scan();assert.equal(target.position.x,20);assert.equal(w.miner.layer,4);b.emit('worldUpdate',new Vec3(20,30,0));assert.equal(w.miner.layer,4);b.emit('worldUpdate',new Vec3(20,6,0));assert.equal(w.miner.layer,6);w.miner.destroy();
});
test('mining paused only for food is queued to resume, while an explicit stop cancels that intent',async()=>{
 const {Runtime}=require('../src/runtime'),w={running:false},r={worker:w,bot:{connected:true,entity:{},dead:false,loggingOut:false},autoLog:{check:async()=>false},ignActions:{tick(){}},safety:{update:()=>false},needsFood:()=>false,resumeMining:true};await Runtime.prototype.tick.call(r);assert.equal(w.startRequested,true);assert.equal(r.resumeMining,false);const noop=()=>{};Object.assign(r,{selfDefense:{stop:noop},follower:{stop:noop},travel:{stopFollowing:noop,cancel:noop},worker:{state:{}},bot:{closeContainer:noop},resumeMining:true});Runtime.prototype.stop.call(r,false);assert.equal(r.resumeMining,false);
});
test('only running bots divide chunks; idle bots do not reserve a mining stripe',()=>{
 const {w}=mineFixture({x2:31}),two={...w,id:2,running:false};w.running=true;w.manager.workers.set(2,two);w.manager.assigned=Manager.prototype.assigned;assert(w.manager.assigned(w,16,0));two.running=true;assert(w.manager.assigned(w,0,0));assert(!w.manager.assigned(w,16,0));assert(w.manager.assigned(two,16,0));w.miner.destroy();
});
test('safe path planning can dig an eligible wall or pillar up, but never digs excluded blocks',()=>{
 const {groundPath}=require('../src/navigation'),bot={blockAt:p=>{const floor=p.y===0,wall=p.x===1&&p.y>=1&&p.y<=3;return {name:floor||wall?'stone':'air',position:p,solid:floor||wall,isAir:!floor&&!wall,boundingBox:floor||wall?'block':'empty',shapes:floor||wall?[[0,0,0,1,1,1]]:[],diggable:true,hardness:1};}};
 const route=groundPath(bot,new Vec3(0,1,0),new Vec3(3,1,0),{dig:true,canDig:()=>true});assert.equal(route[0].action,'dig');const excluded=groundPath(bot,new Vec3(0,1,0),new Vec3(3,1,0),{dig:true,canDig:()=>false});assert(!excluded.some(n=>n.action==='dig'));const tower=groundPath(bot,new Vec3(0,1,0),new Vec3(0,5,0),{block:{name:'stone'}});assert.equal(tower[0].action,'pillar');
});
test('stationary tracked players remain valid after six seconds and direct mode selects their latest position',()=>{
 const {TrailFollower}=require('../src/follow'),b=Object.assign(new EventEmitter(),{entity:{position:new Vec3(0,1,0)},dimensionId:0,actors:new Map(),blockAt:()=>null}),calls=[],travel={follow:(p,...rest)=>{calls.push({p,...rest});return true;},stopFollowing(){}};const r={bot:b,worker:{state:{}},travel},f=new TrailFollower(r),actor={id:3n,name:'Player One',player:true,dimension:0,seen:1,position:new Vec3(9,1,0)};b.actors.set('3',actor);f.start(actor.name,'direct');f.lastSeen=Date.now()-20000;f.tick();assert.equal(calls.at(-1).p.x,9);actor.position=new Vec3(10,1,3);f.record(actor);f.tick();assert.equal(calls.at(-1).p.z,3);assert.equal(f.config.mode,'direct');f.destroy();
});
test('follow direct applies the same mode and full space-containing name to every selected bot',async()=>{
 const states=new Map(),m={names:new Map([[1,'One'],[2,'Two']]),targets:()=>[1,2],workers:new Map(),store:{bot:id=>{if(!states.has(id))states.set(id,{});return states.get(id);},save(){}}};await Manager.prototype.execute.call(m,'all','follow direct Player One');for(const state of states.values()){assert.equal(state.follow.mode,'direct');assert.equal(state.follow.name,'Player One');}
});
test('IGN automation group settings skip other servers and override every selected IGN setting',async()=>{
 const states=new Map(),m={names:new Map([[1,'One'],[2,'Two'],[3,'Three']]),targets:()=>[1,2,3],realm:id=>id===1?'2b2e':'ign',workers:new Map(),store:{bot:id=>{if(!states.has(id))states.set(id,{});return states.get(id);},save(){}}};await Manager.prototype.execute.call(m,'all','autokit on pvp');assert.equal(states.has(1),false);assert.equal(states.get(2).ignActions.autoKit,true);assert.equal(states.get(3).ignActions.kitName,'pvp');
});
test('mixed-realm Anti settings apply to 2b2e and preserve IGN off without failing the group',async()=>{
 const states=new Map(),m={names:new Map([[1,'One'],[2,'Two']]),targets:()=>[1,2],realm:id=>id===1?'2b2e':'ign',workers:new Map(),store:{bot:id=>{if(!states.has(id))states.set(id,{});return states.get(id);},save(){}}};const result=await Manager.prototype.execute.call(m,'all','anticrystal on');assert(states.get(1).runtime.anticrystal);assert.equal(states.get(2).runtime.anticrystal,false);assert.match(result,/IGNではAntiをOFF/);
});
test('online-player completion stays inside the selected realm and preserves spaces',()=>{
 const p=require('../src/player-candidates'),m={names:new Map([[1,'One'],[2,'Two']]),targets:v=>v==='ign'?[2]:[1],workers:new Map([[1,{bot:{connected:true,config:{realm:'2b2e'},players:new Map([['a',{name:'aaasss'}]]),actors:new Map()}}],[2,{bot:{connected:true,config:{realm:'ign'},players:new Map([['a',{name:'A Player'}]]),actors:new Map()}}]])};assert.deepEqual(p.autocomplete(m,'2b2e','id','a'),[{name:'aaasss / 2b2e',value:'aaasss'}]);assert.equal(p.autocomplete(m,'ign','command','follow direct a')[0].value,'follow direct A Player');
});
test('manual chat takes priority over automatic backlog without exceeding pacing or queue limits',t=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:100000});const sent=[],b=Object.assign(new EventEmitter(),{connected:true,client:{queue:(_,p)=>sent.push(p.message)},username:'Bot'}),q=new(require('../src/chat-queue').ChatQueue)(b);q.enqueue('first');for(let i=0;i<6;i++)q.enqueue('auto '+i);assert.equal(q.enqueue('extra'),false);assert(q.enqueue('manual',false,{manual:true}));t.mock.timers.tick(5000);assert.equal(sent[1],'manual');assert(q.pending.length<=6);q.clear();assert.equal(q.pending.length,0);q.close();
});
test('server chat restrictions emit a report once and also pause tells; player quotes do not',t=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:100000});const b=Object.assign(new EventEmitter(),{connected:true,client:{queue(){}},username:'Bot'}),q=new(require('../src/chat-queue').ChatQueue)(b),reports=[];b.on('chatLimited',a=>reports.push(a));assert(q.warning({type:'raw',message:'Please stop spamming in the chat.'}));q.warning({type:'raw',message:'You are muted for spamming.'});assert.equal(reports.length,1);assert(b.nextWhisperAt>Date.now());assert.equal(q.warning({type:'raw',message:'Someone » You are muted for spamming.'}),false);q.close();
});
test('per-bot greeter pools cover multiple targets while the fleet rotates one sender per event',()=>{
 const settings=require('../src/messaging'),states=new Map(),sent=[],manager={names:new Map([[1,'Bot1'],[2,'Bot2']]),store:{bot:id=>{if(!states.has(id))states.set(id,{});return states.get(id);},save(){}},workers:new Map()};for(let id=1;id<=2;id++)manager.workers.set(id,{bot:{connected:true,config:{host:'local',port:1},chat:text=>{sent.push({id,text});return true;}}});settings.configure(manager,[1,2],'greeting',{enabled:true,targets:['Asira','Player One'],join:['Welcome','Hi'],leave:[],chat:[]});let now=100000;const g=new(require('../src/greetings').FleetGreetings)(manager,{env:{},clock:()=>now,choose:()=>0});g.handle(1,{type:'raw',message:'[+] Asira'});g.handle(2,{type:'raw',message:'[+] Asira'});assert.equal(sent.length,1);now+=5000;g.handle(1,{type:'raw',message:'[+] Player One'});assert.equal(sent.length,2);assert.notEqual(sent[0].id,sent[1].id);assert.match(sent[1].text,/^@Player One \| Welcome \|/);assert(require('../src/greetings').pools.join.length>=20);
});
test('custom replies ignore non-targets and whispers and use one fleet response per target cooldown',()=>{
 const messaging=require('../src/messaging'),state={},sent=[],manager={names:new Map([[1,'Bot']]),workers:new Map([[1,{bot:{connected:true,config:{host:'local'},chat:t=>{sent.push(t);return true;}}}]]),store:{bot:()=>state,save(){}}};messaging.configure(manager,[1],'replies',{enabled:true,targets:['Asira','Player One'],messages:['OK','Hello']});const g=new(require('../src/greetings').FleetGreetings)(manager,{env:{},choose:()=>0});assert.equal(g.handle(1,{type:'whisper',source_name:'Asira',message:'hello'}),false);assert.equal(g.handle(1,{type:'chat',source_name:'Other',message:'hello'}),false);assert(g.handle(1,{type:'chat',source_name:'Asira',message:'hello'}));assert.equal(g.handle(1,{type:'chat',source_name:'Asira',message:'again'}),false);assert.equal(sent.length,1);
});
test('five-minute announcements retain per-bot content but never produce a simultaneous fleet burst',t=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:100000});const messaging=require('../src/messaging'),states=new Map(),sent=[],manager={names:new Map([[1,'One'],[2,'Two']]),workers:new Map(),store:{bot:id=>{if(!states.has(id))states.set(id,{});return states.get(id);},save(){}}};for(const id of [1,2])manager.workers.set(id,{bot:{connected:true,config:{host:'local'},chat:text=>{sent.push({id,text});return true;}}});messaging.configure(manager,[1],'announcement',{enabled:true,messages:['One notice'],intervalSeconds:300});messaging.configure(manager,[2],'announcement',{enabled:true,messages:['Two notice'],intervalSeconds:300});const g=new(require('../src/greetings').FleetGreetings)(manager,{env:{},choose:()=>0});g.tick();assert.equal(sent.length,0);t.mock.timers.tick(300000);g.tick();g.tick();assert.deepEqual(sent,[{id:1,text:'One notice'}]);t.mock.timers.tick(300000);g.tick();assert.deepEqual(sent[1],{id:2,text:'Two notice'});assert.throws(()=>messaging.configure(manager,[1],'announcement',{enabled:true,messages:['bad rate'],intervalSeconds:1}),/300/);
});
