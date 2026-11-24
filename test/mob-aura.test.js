'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{Vec3}=require('vec3'),{fixture}=require('./helpers/mining-world'),mob=require('../modules/combat/mob-aura/mobaura');
function actor(id,name,x=2.5){return {id:BigInt(id),name:'minecraft:'+name,player:false,dimension:0,position:new Vec3(x,65,.5)};}
function setup(t){const f=fixture(t);f.w.state.mobAura={enabled:true,range:4,delay:100,weapon:'Auto',targets:'Hostile'};f.w.running=true;f.b.items[2]=f.item('netherite_sword',12);f.b.items[3]=f.item('netherite_axe',13);f.w.mobAura=new mob.MobAura(f.w);t.after(()=>f.w.mobAura.destroy());return f;}
test('MobAura ignores players, crystals, dropped items, vehicles and distant mobs',t=>{
 const f=setup(t);for(const a of [actor(20,'ender_crystal'),actor(21,'item'),actor(22,'boat'),{...actor(23,'player'),player:true},actor(24,'zombie',7)])f.b.actors.set(String(a.id),a);assert.equal(mob.target(f.b,f.w.state.mobAura),null);
 const zombie=actor(25,'zombie');f.b.actors.set('25',zombie);assert.equal(mob.target(f.b,f.w.state.mobAura),zombie);f.b.actors.delete('25');const cow=actor(26,'cow');f.b.actors.set('26',cow);assert.equal(mob.target(f.b,f.w.state.mobAura),null);assert.equal(mob.target(f.b,{...f.w.state.mobAura,targets:'All Mobs'}),cow);
});
test('MobAura uses a selected axe while Nuke remains enabled and running',async t=>{
 const f=setup(t);f.w.state.nukeEnabled=true;f.w.state.mobAura.weapon='Axe';const a=actor(30,'zombie');f.b.actors.set('30',a);assert(await f.w.mobAura.pulse());assert(f.b.name(f.b.items[f.b.quickBarSlot]).endsWith('_axe'));const attacks=f.packets.filter(p=>p.name==='inventory_transaction'&&p.params.transaction.transaction_type==='item_use_on_entity');assert.equal(attacks.length,1);assert.equal(attacks[0].params.transaction.transaction_data.entity_runtime_id,30n);assert.equal(f.w.running,true);assert.equal(f.w.state.nukeEnabled,true);assert.equal(f.b.actionHandBusy,false);
});
test('nearby mobs interrupt only mining hand work; eating and walls retain priority',async t=>{
 const f=setup(t),a=actor(31,'zombie');f.b.actors.set('31',a);const abort=f.w.abort=new AbortController();f.b.actionHandBusy={kind:'mining'};assert.equal(await f.w.mobAura.pulse(),false);assert(abort.signal.aborted);f.b.actionHandBusy=false;f.b.handUse={phase:'using'};assert.equal(await f.w.mobAura.pulse(),false);f.b.handUse=null;f.set(new Vec3(1,66,0),'stone');f.set(new Vec3(1,65,0),'stone');assert.equal(await f.w.mobAura.pulse(),false);assert.equal(f.w.mobAura.attacks,0);
});
test('weapon selector keeps pickaxes out and supports sword-only and axe-only modes',t=>{
 const f=setup(t);assert.equal(mob.weapon(f.b,'Sword').name,'netherite_sword');assert.equal(mob.weapon(f.b,'Axe').name,'netherite_axe');f.b.items[2]=null;f.b.items[3]=null;assert.equal(mob.weapon(f.b,'Auto'),undefined);
});
test('missing weapons allow mining; armed MobAura holds mining during cooldown',async t=>{
 const f=setup(t);f.b.actors.set('32',actor(32,'zombie'));const abort=f.w.abort=new AbortController();f.b.actionHandBusy={kind:'mining'};f.b.items[2]=null;f.b.items[3]=null;assert.equal(await f.w.mobAura.pulse(),false);assert.equal(abort.signal.aborted,false);f.b.items[2]=f.item('netherite_sword',12);f.w.mobAura.lastAttack=Date.now();assert.equal(await f.w.mobAura.pulse(),false);assert.equal(abort.signal.aborted,true);assert(f.w.mobAura.holdsMining);
});
test('Combat settings enable and update MobAura without issuing a command that stops Nuke',async()=>{
 const desktop=require('../desktop/bridge/desktop-modules'),s={nukeEnabled:true,runtimePaused:true},w={running:true,runtime:{paused:true}},m={store:{bot:()=>s,save(){}},workers:new Map([[1,w]]),execute(){throw Error('legacy command must not run');}};const web={manager:m,targets:()=>[1]};assert.equal(desktop.catalog.MobAura.group,'Combat');
 assert((await desktop.apply(web,{}, {module:'MobAura',enabled:true,target:'1',values:{Range:3,'Attack Delay':500,Weapon:'Axe',Targets:'Hostile'}})).ok);assert.equal(s.mobAura.enabled,true);assert.equal(s.runtimePaused,false);assert.equal(w.runtime.paused,false);assert.equal(s.nukeEnabled,true);assert.equal(w.running,true);
 assert((await desktop.apply(web,{}, {module:'MobAura',enabled:null,target:'1',values:{Range:5,'Attack Delay':750,Weapon:'Sword',Targets:'All Mobs'}})).ok);assert.equal(s.mobAura.range,5);assert.equal(s.mobAura.enabled,true);assert.equal(w.running,true);
});
