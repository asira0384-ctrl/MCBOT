'use strict';
const {Vec3}=require('vec3');const {norm,key,solid}=require('./util');const equipment=require('./equipment');const {nearestEnemy,lineOfSight}=require('./actors');const {Travel}=require('./travel');
const defaults={gear:true,autototem:true,autoslot:true,heal:true,healHearts:6,killaura:false,range:3.2,chaseRange:12,autolog:false,logHearts:3,anticrystal:false,burrowDepth:.55,flyHorizontal:1.5,flyVertical:.7};
class Runtime{
 constructor(worker){this.worker=worker;this.bot=worker.bot;this.manager=worker.manager;this.config=worker.state.runtime=Object.assign({},defaults,worker.state.runtime);this.travel=new Travel(this);this.safety=new (require('./safety').WaterSafety)(this);this.busy=false;this.paused=false;this.dirty=false;this.receiving=false;this.attacks=0;this.totemsUsed=0;this.lastAttack=0;this.lastHeal=0;this.lastStrength=0;this.processedBoxes=new Set();this.events=[];this.target=null;this.lastError='';
  this.bot.on('inventory',(_,item)=>{if(item&&equipment.wanted(this.bot.name(item)))this.dirty=true;});
  this.bot.on('totemUsed',()=>{this.totemsUsed++;this.worker.stop();this.notice('Totemが割れました。オフハンドを補充します');});
  this.bot.on('death',()=>{this.safety.cancel();this.abort?.abort();this.travel.cancel(false);this.receiving=false;this.target=null;if(worker.state.respawn)this.bot.requestRespawn();this.notice('死亡・自動リスポーン待ち');});
  this.bot.on('respawned',()=>{this.safety.arm();this.dirty=true;const p=this.bot.entity.position;this.notice(`リスポーンしました。座標: ${Math.floor(p.x)} ${Math.floor(p.y)} ${Math.floor(p.z)} / ${['現世','ネザー','エンド'][this.bot.dimensionId]||this.bot.dimensionId}。装備の補給待ちです`);});
  this.bot.on('collisionBlocked',()=>{this.worker.stop();this.noticeOnce('ブロック内への落下を止めました。サーバーの位置補正を待ちます');});
  this.bot.on('forcedMove',()=>{this.travel.rollback();this.safety.invalidate();});
  this.bot.on('end',()=>this.destroy());
  this.timer=setInterval(()=>this.tick().catch(e=>{if(e.message!==this.lastError){this.lastError=e.message;this.notice(e.message);}this.receiving=false;this.paused=true;this.retryAt=Date.now()+5000;this.worker.stop();this.bot.closeContainer();this.travel.cancel();}),250);this.timer.unref?.();
 }
 notice(text){this.events.push({at:Date.now(),text:String(text).slice(0,250)});this.events=this.events.slice(-12);this.manager.notice(this.worker.id,text);}
 async maintenance(name,fn,signal){this.featureErrors??={};const previous=this.featureErrors[name];if(previous?.retryAt>Date.now())return false;this.operation=name;try{await fn();delete this.featureErrors[name];return true;}catch(e){if(signal.aborted)throw e;this.featureErrors[name]={message:e.message,at:Date.now(),retryAt:Date.now()+30000};this.bot.closeContainer();this.notice(`${name}: ${e.message}。この機能だけ30秒待って再試行します`);return false;}}
 stop(cancelSafety=true){if(cancelSafety)this.safety.cancel();this.pendingMove=null;this.paused=true;this.receiving=false;this.travel.cancel();this.abort?.abort();this.bot.closeContainer();}
 requestMove(...args){require('./travel').validateGoal(...args);this.abort?.abort();this.worker.stop();this.bot.closeContainer();this.pendingMove=args;this.receiving=false;this.paused=false;this.retryAt=0;this.notice('移動先を受け付けました。現在の操作を止めて移動します');}
 receive(){this.worker.stop();this.stop(false);this.paused=false;this.retryAt=0;this.processedBoxes.clear();this.receiving=true;this.receivedAt=Date.now();this.dirty=true;this.notice('装備・アイテム・シュルカー受け取り待ち。最後の受信から3秒後にホットバーを整理します');}
 snapshot(){return {busy:this.busy,operation:this.operation||null,lastError:this.lastError,featureErrors:this.featureErrors||{},pendingMove:this.pendingMove||null,waterSafety:this.safety.snapshot(),inventoryMode:this.bot.inventoryMode,serverAuthoritativeInventory:this.bot.serverAuthoritativeInventory,paused:this.paused,target:this.target?.name||null,attacksSent:this.attacks,totemsUsed:this.totemsUsed,receiving:this.receiving,travel:this.travel.route?{mode:this.travel.route.mode,dimension:this.travel.route.dimension,destination:this.travel.route.destination}:null,movement:this.travel.waiting,flight:!!this.travel.flight,burrowActive:!!this.travel.embed,config:this.config,offhand:this.bot.name(this.bot.offhand?.[0]),armor:(this.bot.armor||[]).map(i=>this.bot.name(i)),lastEvent:this.events.at(-1)||null};}
 async tick(){const b=this.bot,w=this.worker;if(!b.connected||b.ended||b.loggingOut||!b.entity)return;
  if(b.dead){if(w.state.respawn)b.requestRespawn();return;}
  if(this.config.autolog&&b.health!==null&&b.health>0&&b.health<=this.config.logHearts*2){this.notice(`AutoLog: 体力${b.health/2}ハートで切断します`);this.travel.cancel(false);this.abort?.abort();this.safety.cancel();this.worker.stop();await b.logout('あぶねぇwあぶねぇw死にかけたぜw');return;}
  if(this.safety.update()||this.safety.active)return;
  if(this.busy||Date.now()<(this.retryAt||0))return;
  const low=this.config.heal&&b.health!==null&&b.health>0&&b.health<this.config.healHearts*2;
  if(low&&w.running){w.stop();}
  if(w.busy)return;
  if(this.pendingMove&&(!low||!b.find('enchanted_golden_apple'))){const args=this.pendingMove;this.pendingMove=null;this.paused=false;this.travel.command(...args);}
  this.busy=true;w.controlBusy=true;this.abort=new AbortController();const signal=this.abort.signal;
  try{
   if(low)w.mode='healing';
   await this.maintenance('オフハンド装着',()=>equipment.wear(b,{armor:false,totem:this.config.autototem},signal),signal);
   if(low&&b.find('enchanted_golden_apple')){this.operation='体力回復';this.travel.unbury();if(this.travel.flight)this.travel.flight.paused='health';w.mode='healing';
    if(Date.now()-this.lastHeal>=5000){await b.openInventory(signal);await b.equip(b.find('enchanted_golden_apple').slot);b.closeContainer();await b.eat(signal);this.lastHeal=Date.now();this.dirty=true;this.notice('エンチャント金リンゴを食べました');}return;
   }
   if(low)this.noticeOnce('回復用エンチャント金リンゴがありません。指定座標への移動は続けます');
   if(w.mode==='healing')w.mode='stopped';if(this.travel.flight?.paused==='health')this.travel.flight.paused=false;
   if(this.receiving){this.operation='装備・箱の受け取り';const handled=await this.receiveBox(signal);if(handled)return;if(Date.now()-Math.max(this.receivedAt,b.lastInventoryAt||0)<3000)return;this.receiving=false;this.notice('受け取りを終了。ホットバーを整理します');}
   await this.maintenance('防具装着',()=>equipment.wear(b,{armor:this.config.gear,totem:false,elytra:!!(this.travel.flight||this.travel.route?.mode==='fly')},signal),signal);
   if(this.config.autoslot&&this.dirty&&b.list().some(i=>equipment.wanted(i.name))){if(await this.maintenance('AutoSlot',()=>equipment.autoSlots(b,signal),signal)){this.dirty=false;this.notice('AutoSlot: 剣1・ツルハシ2・ガップル3・力4・Totem5・盾6・ロケット7');}}
   if(this.paused)return;
   const ownNames=[...(this.manager.names?.values()||[])].map(norm),enemies=(this.manager.store.data.enemies||[]).filter(e=>!ownNames.includes(norm(e.name)));
   const enemy=this.config.killaura&&!low?nearestEnemy(b,enemies,this.config.chaseRange):null;this.target=enemy;
   if(enemy&&!this.travel.route){this.operation='指定した敵との戦闘';if(w.running)w.stop();if(this.travel.flight){if(!this.travel.flight.landing&&!this.travel.flight.paused)this.travel.cancel();return;}await this.combat(enemy,signal);return;}
   this.operation=this.travel.route?'座標移動':null;this.travel.unbury();b.setControlState('sneak',false);await this.travel.tick(signal);this.lastError='';
  }catch(e){if(!signal.aborted)throw e;}finally{this.operation=null;this.busy=false;w.controlBusy=false;}
 }
 noticeOnce(text){if(this.lastWarning===text&&Date.now()-(this.lastWarningAt||0)<30000)return;this.lastWarning=text;this.lastWarningAt=Date.now();this.notice(text);}
 async combat(enemy,signal){const b=this.bot,point=enemy.position.offset(0,1,0);this.travel.flight=null;
  if(this.config.anticrystal&&!this.travel.embed&&Date.now()>(this.burrowBlockedUntil||0))this.travel.bury(this.config.burrowDepth);
  const effect=b.effects.get(5);const potion=equipment.strengthPotion(b);
  if(potion&&(!effect||effect.expires<=Date.now())&&Date.now()-this.lastStrength>10000){await b.openInventory(signal);await b.equip(potion.slot);b.closeContainer();await b.drink(b.list().find(i=>i.name==='potion'&&[31,32,33].includes(i.raw.metadata))||potion,signal);this.lastStrength=Date.now();this.dirty=true;this.notice('力のポーションを飲みました');}
  const sword=equipment.best(b,'_sword');if(!sword){this.noticeOnce('戦闘用の剣がありません');return;}if(sword.slot>=9){await b.openInventory(signal);await b.equip(sword.slot);b.closeContainer();}else await b.equip(sword.slot);
  const current=b.actors.get(String(enemy.id)),active=nearestEnemy(b,this.manager.store.data.enemies||[],this.config.chaseRange);if(signal?.aborted||!current||this.paused||!this.config.killaura||active?.id!==enemy.id)return;
  if(b.entity.position.distanceTo(enemy.position)>this.config.range){this.travel.unbury();await this.travel.walk(enemy.position,'walk',signal);return;}
  if(!lineOfSight(b,point)){this.travel.unbury();return;}
  b.clearControlStates();b.lookAt(point,false);if(b.name(b.offhand[0])==='shield')b.setControlState('sneak',true);
  if(Date.now()-this.lastAttack>=400){b.attack(enemy);this.attacks++;this.lastAttack=Date.now();if(this.lastEnemy!==enemy.name){this.lastEnemy=enemy.name;this.notice(`指定した敵を攻撃: ${enemy.name}`);}}
 }
 async receiveBox(signal){const b=this.bot,w=this.worker;let state=w.state.autoBox;
  if(!state){let position=null,name=null;const p=b.entity.position;for(let x=Math.floor(p.x)-3;x<=Math.floor(p.x)+3;x++)for(let z=Math.floor(p.z)-3;z<=Math.floor(p.z)+3;z++)for(let y=Math.floor(p.y)-1;y<=Math.floor(p.y)+2;y++){const q=new Vec3(x,y,z),block=b.blockAt(q);if(block&&/shulker_box$/.test(block.name)&&b.reach(block)){position=q;name=block.name;break;}}
   if(!position){const box=b.list().find(i=>/shulker_box$/.test(i.name)&&!this.processedBoxes.has(i.raw.stack_id));if(!box)return false;position=w.supplySpot();name=box.name;await b.openInventory(signal);if(box.slot!==8)await b.swap(box.slot,8);b.closeContainer();state=w.state.autoBox={name,position:{x:position.x,y:position.y,z:position.z},phase:'placing'};this.manager.store.save();await w.placeOwned(position,b.find(name),'shulker',signal);}
   state=w.state.autoBox={name,position:{x:position.x,y:position.y,z:position.z},phase:'placed'};this.manager.store.save();
  }
  const pos=new Vec3(state.position.x,state.position.y,state.position.z);
  if(state.phase==='placing'){const block=b.blockAt(pos);if(!block||block.name!==state.name)throw Error('補給シュルカーの設置を確認できません。手動確認してください');state.phase='placed';}
  if(state.phase==='placed'){
   const box=await b.openContainer(pos,signal);if(box.items.length!==27)throw Error('シュルカーの27枠を確認できません');
   for(let slot=0;slot<box.items.length;slot++){const raw=box.items[slot];if(!raw||!equipment.wanted(b.name(raw)))continue;if(b.items.filter(i=>!i).length<=1)break;const free=b.items.findIndex(i=>!i);if(free<0)break;await b.transfer(true,slot,false,free);}
   state.empty=box.items.every(i=>!i||!i.network_id);b.closeContainer();this.manager.store.save();
   if(!b.items.some(i=>!i))throw Error('シュルカーの回収用にインベントリを1枠空けてください');const item=await w.collectPlaced(pos,state.name,signal);state.phase='carried';state.stackId=item.raw.stack_id;this.manager.store.save();
  }
  if(state.phase==='stored'){await w.recoverChest(new Vec3(state.chest.x,state.chest.y,state.chest.z),signal);w.state.autoBox=null;this.manager.store.save();return true;}
  const item=b.list().find(i=>i.name===state.name&&i.raw.stack_id===state.stackId);if(!item)throw Error('回収した補給シュルカーの識別ができません。手動確認してください');
  if(state.empty)await b.drop(item.slot,1);else if(b.find('ender_chest')&&b.tool(true)||state.chest){
   let chestPos;if(state.chest)chestPos=new Vec3(state.chest.x,state.chest.y,state.chest.z);else{chestPos=w.supplySpot();state.chest={x:chestPos.x,y:chestPos.y,z:chestPos.z};this.manager.store.save();await w.placeOwned(chestPos,b.find('ender_chest'),'ender_chest',signal);}
   const chest=await b.openContainer(chestPos,signal),free=chest.items.findIndex(i=>!i);if(free<0)throw Error('エンダーチェストが満杯です。シュルカーを保持します');await b.transfer(false,item.slot,true,free,1);b.closeContainer();state.phase='stored';this.manager.store.save();await w.recoverChest(chestPos,signal);
  }else this.notice('中身入りシュルカーを保持しました。エンダーチェストとシルクタッチがあれば収納できます');
  this.processedBoxes.add(item.raw.stack_id);w.state.autoBox=null;this.manager.store.save();this.dirty=true;this.receivedAt=Date.now();this.notice('シュルカーから装備を取り出しました');return true;
 }
 destroy(){if(this.destroyed)return;this.destroyed=true;this.safety.cancel();clearInterval(this.timer);this.abort?.abort();this.travel.route=null;this.travel.flight=null;this.travel.embed=null;}
}
module.exports={Runtime,defaults};
