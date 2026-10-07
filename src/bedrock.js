'use strict';
const EventEmitter=require('node:events');const path=require('node:path');const fs=require('node:fs');
const bedrock=require('bedrock-protocol');const nbt=require('prismarine-nbt');const {Vec3}=require('vec3');
const {World}=require('./world');const {useItem,request,slotRef,adaptInput,emptyItem}=require('./protocol');
const {sleep,air,solid,key,norm}=require('./util');
const physics=require('../vendor/bedrockflayer/lib/physics/engine');
const controls=require('../vendor/bedrockflayer/lib/plugins/controls');
const pathfinder=require('../vendor/bedrockflayer/lib/plugins/pathfinder');
class BedrockBot extends EventEmitter {
 constructor(config,authCallback){super();this.setMaxListeners(60);this.config=config;this.username=config.name;this.items=Array(36).fill(null);this.quickBarSlot=0;this.tick=0;this.physicsEnabled=true;this.players=new Map();this.health=null;this.connected=false;this.dead=false;this.window=null;this.requestId=-1;this.abortVersion=0;this.dimensionId=0;this.ended=false;this.connectionPhase='Microsoft/Xbox認証中';
  fs.mkdirSync(config.authDir,{recursive:true,mode:0o700});
  this.client=bedrock.createClient({host:config.host,port:config.port,username:`asira-bot-${config.id}`,offline:false,
   ...(config.version?{version:config.version}:{}),profilesFolder:config.authDir,raknetBackend:'jsp-raknet',followPort:false,
   onMsaCode:data=>{if(!this.ended&&!this.client?._closed){this.connectionPhase='Microsoft認証待ち';authCallback(data);}},conLog:()=>{},connectTimeout:60000,transport:'raknet'});
  this.client.on('session',()=>{if(this.ended)return;this.connectionPhase='サーバーへUDP接続中';this.emit('authComplete');});
  this.client.on('loggingIn',()=>{if(this.ended)return;this.connectionPhase='サーバーログイン中';this.emit('connectionStage',this.connectionPhase);});
  this.client.on('join',()=>{if(this.ended)return;this.connectionPhase='ワールド読み込み中';this.emit('connectionStage',this.connectionPhase);});
  const queue=this.client.queue.bind(this.client);
  this.client.queue=(name,data)=>{if(name==='player_auth_input'){if(!this.registry)return;data=adaptInput(this,data);}return queue(name,data);};
  this.worldMirror=new World(this);this.blockAt=p=>this.worldMirror.get(p);
  physics(this);controls(this);pathfinder(this);
  this.client.on('start_game',p=>{try{
   this._runtimeEntityId=p.runtime_entity_id;this.serverBreak=p.server_authoritative_block_breaking!==false;this.dimensionId=typeof p.dimension==='number'?p.dimension:({overworld:0,the_nether:1,the_end:2}[p.dimension]??0);
   this.entity={position:new Vec3(p.player_position.x,p.player_position.y-1.62,p.player_position.z),velocity:new Vec3(0,0,0),yaw:(p.rotation?.z||0)*Math.PI/180,pitch:(p.rotation?.x||0)*Math.PI/180,onGround:false,effects:{}};this.position=this.entity.position;this.worldMirror.init(p);
   this.client.queue('client_cache_status',{enabled:false});
  }catch(e){this.emit('error',e);this.disconnect();}});
  this.client.on('item_registry',p=>{if(this.registry&&p.itemstates)this.registry.handleStartGame({...this.client.startGameData,itemstates:p.itemstates});});
  this.client.on('level_chunk',p=>this.decode(()=>this.worldMirror.chunk(p)));
  this.client.on('subchunk',p=>this.decode(()=>this.worldMirror.subchunk(p)));
  this.client.on('update_block',p=>this.worldMirror.update(p));this.client.on('update_block_synced',p=>this.worldMirror.update(p));
  this.client.on('spawn',()=>{const actual=this.client.profile?.name||this.client.username;
   if(norm(actual)!==norm(config.name)){this.emit('error',Error(`ログインしたゲーマータグが違います: ${actual} / 設定 ${config.name}`));this.disconnect();return;}
   this.username=actual;this.connected=true;this.connectionPhase='接続済み';this.client.queue('request_chunk_radius',{chunk_radius:4,max_radius:4});this.emit('spawn');});
  this.client.on('text',p=>this.emit('chat',p));
  this.client.on('player_list',p=>{const payload=p.records;if(!payload)return;const records=Array.isArray(payload)?payload:payload.records||[];for(const v of records){const action=Array.isArray(payload)?v.type:payload.type;if(action==='add'){if(v.username&&v.xbox_user_id)this.players.set(norm(v.username),{name:v.username,xuid:String(v.xbox_user_id),uuid:v.uuid});}else if(action==='remove')for(const[k,a]of this.players)if(a.uuid===v.uuid)this.players.delete(k);}});
  this.client.on('inventory_content',p=>{const wid=p.window_id;const type=p.container?.container_id;if(wid==='inventory'||wid===0||type==='inventory'){this.setItems(p.input||[]);}else if(this.window&&wid===this.window.id){this.window.items=(p.input||[]).map(i=>i.network_id?i:null);this.window.ready=true;this.emit('windowContent');}});
  this.client.on('inventory_slot',p=>{if(p.window_id==='inventory'||p.window_id===0||p.container?.container_id==='inventory') {const old=this.items[p.slot];this.items[p.slot]=p.item?.network_id?p.item:null;this.emit('inventory',old,this.items[p.slot]);} else if(this.window&&p.window_id===this.window.id){this.window.items[p.slot]=p.item?.network_id?p.item:null;}});
  this.client.on('container_open',p=>{this.window={id:p.window_id,type:p.window_type,position:p.coordinates,items:[],ready:false};this.emit('windowOpen');});
  this.client.on('container_close',()=>{this.window=null;});
  this.client.on('update_attributes',p=>{if(String(p.runtime_entity_id)!==String(this._runtimeEntityId))return;for(const a of p.attributes||[])if(a.name==='minecraft:health') {this.health=a.current;if(this.health<=0&&!this.dead){this.dead=true;this.halt();this.emit('death');}this.emit('health');}});
  this.client.on('respawn',p=>{if(p.state===0||p.state==='searching')return;if(p.position&&this.entity){this.entity.position=new Vec3(p.position.x,p.position.y-1.62,p.position.z);this.entity.velocity=new Vec3(0,0,0);this.position=this.entity.position;}if(p.state===1||p.state==='ready'){this.respawnPacket=p;this.emit('respawnReady');}});
  this.client.on('change_dimension',()=>{this.halt();this.emit('error',Error('ディメンションが変わりました。再接続して範囲を設定してください'));});
  this.client.on('error',e=>this.emit('error',e));this.client.on('kick',p=>this.emit('error',Error(String(p.message||p.reason||'切断'))));
  this.client.on('close',()=>this.finish());
 }
 decode(fn){this.worldMirror.loading=this.worldMirror.loading.then(fn).catch(e=>{this.emit('error',Error('地形デコード: '+e.message));});}
 setItems(items){const old=this.items;this.items=Array.from({length:36},(_,i)=>items[i]?.network_id?items[i]:null);for(let i=0;i<36;i++)if((this.items[i]?.count||0)>(old[i]?.count||0)||this.items[i]?.network_id!==old[i]?.network_id)this.emit('inventory',old[i],this.items[i]);}
 name(item){return item?this.registry?.items[item.network_id]?.name||`unknown_${item.network_id}`:'';}
 list(){return this.items.map((raw,slot)=>raw?{raw,slot,name:this.name(raw),count:raw.count}:null).filter(Boolean);}
 find(name){return this.list().find(i=>i.name===name);}
 count(name){return this.list().filter(i=>i.name===name).reduce((a,b)=>a+b.count,0);}
 nbt(item){try{return nbt.simplify(item?.extra?.nbt?.nbt||item?.extra?.nbt);}catch{return null;}}
 damage(item){const data=this.nbt(item);return Number(data?.Damage??data?.damage??item?.metadata??0);}
 enchant(item,name,id){return (this.nbt(item)?.ench||[]).some(e=>(e.id===id||e.id===name)&&e.lvl>0);}
 tool(silk=false){const caps={netherite_pickaxe:2031,diamond_pickaxe:1561,iron_pickaxe:250,stone_pickaxe:131,golden_pickaxe:32,wooden_pickaxe:59};return this.list().filter(i=>(!silk||this.enchant(i.raw,'silk_touch',16))&&caps[i.name]&&caps[i.name]-this.damage(i.raw)>10).sort((a,b)=>caps[b.name]-caps[a.name])[0];}
 select(slot){this.quickBarSlot=slot;this.client.queue('mob_equipment',{runtime_entity_id:this._runtimeEntityId,item:this.items[slot]||emptyItem(),slot,selected_slot:slot,window_id:'inventory'});}
 async equip(slot){if(slot<9){this.select(slot);return;}await this.swap(slot,0);this.select(0);}
 slot(type,index,item){return slotRef(type,index,item);}
 async transaction(action,changes,signal){const id=this.requestId--;const before=this.abortVersion;
  const response=new Promise((resolve,reject)=>{const timer=setTimeout(()=>{cleanup();reject(Error('アイテム移動の応答がありません'));},7000);
   const onResponse=p=>{const r=p.responses?.find(r=>r.request_id===id);if(!r)return;cleanup();if(r.status!=='ok'&&r.status!==0)return reject(Error('サーバーがアイテム操作を拒否しました'));resolve(r);};
   const onEnd=()=>{cleanup();reject(Error('切断'));};const cleanup=()=>{clearTimeout(timer);this.client.removeListener('item_stack_response',onResponse);this.removeListener('end',onEnd);};this.client.on('item_stack_response',onResponse);this.on('end',onEnd);
   try{this.client.queue('item_stack_request',request(id,[action]));}catch(e){cleanup();reject(e);}
  });
  const r=await response;
  // Accepted responses contain final counts/stack IDs. Apply planned identities, then authoritative counts.
  for(const c of changes)c.array[c.slot]=c.item?structuredClone(c.item):null;
  for(const container of r.containers||[]){const type=container.slot_type?.container_id;const array=['inventory','hotbar','hotbar_and_inventory'].includes(type)?this.items:type==='level_entity'?this.window?.items:null;if(!array)continue;
   for(const s of container.slots||[]){if(s.count===0)array[s.slot]=null;else if(array[s.slot]){array[s.slot].count=s.count;array[s.slot].stack_id=s.item_stack_id;if(s.durability_correction>0)array[s.slot].metadata=s.durability_correction;}}
  }
  if(signal?.aborted||before!==this.abortVersion)throw Error('停止しました');return r;
 }
 async swap(a,b){const ai=this.items[a],bi=this.items[b];await this.transaction({type_id:'swap',source:this.slot('hotbar_and_inventory',a,ai),destination:this.slot('hotbar_and_inventory',b,bi)},[{array:this.items,slot:a,item:bi},{array:this.items,slot:b,item:ai}]);}
 async drop(slot,count){const item=this.items[slot];if(!item)return;const n=Math.min(count||item.count,item.count);await this.transaction({type_id:'drop',count:n,source:this.slot('hotbar_and_inventory',slot,item),randomly:false},[{array:this.items,slot,item:n===item.count?null:{...item,count:item.count-n}}]);}
 async transfer(fromContainer,from,toContainer,to,count){const src=fromContainer?this.window?.items:this.items,dst=toContainer?this.window?.items:this.items;if(!src||!dst)throw Error('コンテナが閉じています');const item=src[from];if(!item)throw Error('取り出すアイテムがありません');if(dst[to])throw Error('移動先に空きがありません');const n=Math.min(count||item.count,item.count);
  await this.transaction({type_id:'take',count:n,source:this.slot(fromContainer?'level_entity':'hotbar_and_inventory',from,item),destination:this.slot(toContainer?'level_entity':'hotbar_and_inventory',to,null)},[{array:src,slot:from,item:n===item.count?null:{...item,count:item.count-n}},{array:dst,slot:to,item:{...item,count:n}}]);
 }
 async waitUntil(fn,ms=5000,signal){const start=Date.now();const epoch=this.abortVersion;while(Date.now()-start<ms){if(signal?.aborted||epoch!==this.abortVersion||!this.connected)throw Error('停止・切断しました');if(fn())return;await sleep(50);}throw Error('サーバーの確認がタイムアウトしました');}
 halt(){this.abortVersion++;this.pathfinder?.stop();this.clearControlStates?.();if(this.mining)this.breakAction={action:'abort_break',position:this.mining,face:1};this.mining=null;this.usingItem=false;}
 finish(){if(this.ended)return;this.ended=true;this.connected=false;this.connectionPhase='切断済み';this.halt();this.emit('end');}
 disconnect(){if(this.ended)return;this.halt();try{this.closeContainer();}catch{}try{this.client.disconnect('Stopping');}catch{}finally{try{this.client.close();}catch{}this.finish();}}
 chat(text){if(this.connected)this.client.queue('text',{type:'chat',needs_translation:false,source_name:this.username,message:text.slice(0,220),xuid:'',platform_chat_id:'',filtered_message:''});}
 reach(block){const p=this.entity?.position;if(!p||!block)return false;return p.offset(0,1.62,0).distanceTo(block.position.offset(.5,.5,.5))<=4.4;}
 visible(block){const eye=this.entity.position.offset(0,1.62,0);const center=block.position.offset(.5,.5,.5);const d=center.minus(eye);const n=Math.ceil(d.norm()*8);for(let j=1;j<n;j++){const b=this.blockAt(eye.plus(d.scaled(j/n)));if(!b)return false;if(key(b.position)===key(block.position))return true;if(solid(b))return false;}return true;}
 breakTime(block,tool){const speeds={netherite_pickaxe:9,diamond_pickaxe:8,iron_pickaxe:6,stone_pickaxe:4,golden_pickaxe:12,wooden_pickaxe:2};let speed=/obsidian|stone|ore|netherrack|basalt|brick|rock|iron|metal/.test(block.name+' '+(block.material||''))?(speeds[tool.name]||1):1;const eff=(this.nbt(tool.raw)?.ench||[]).find(e=>e.id===15||e.id==='efficiency')?.lvl||0;if(speed>1&&eff)speed+=eff*eff+1;return Math.ceil(1500*Math.max(0,block.hardness)/speed/50)*50+100;}
 async dig(block,signal,preferredTool){if(!this.reach(block)||!this.visible(block))throw Error('ブロックに手が届きません');if(!block.diggable||block.hardness<0)throw Error('破壊できないブロックです');const tool=preferredTool||this.tool();if(!tool)throw Error('ピッケルがなくなりました');if(block.name==='obsidian'&&!['diamond_pickaxe','netherite_pickaxe'].includes(tool.name))throw Error('黒曜石用のダイヤ・ネザライトピッケルが必要です');
  await this.equip(tool.slot);this.clearControlStates();await sleep(150);this.lookAt(block.position.offset(.5,.5,.5),false);
  const startId=block.stateId;this.mining={x:block.position.x,y:block.position.y,z:block.position.z};this.breakAction={action:'start_break',position:this.mining,face:1};
  let predicted=false;const started=Date.now();const breakMs=this.breakTime(block,tool);
  const sustaining=setInterval(()=>{try{if(this.mining){this.breakAction={action:'crack_break',position:this.mining,face:1};if(!this.serverBreak&&!predicted&&Date.now()-started>=breakMs){predicted=true;this.client.queue('inventory_transaction',useItem(this,'break_block',this.mining,1,block.stateId));}}}catch(e){this.halt();this.emit('error',e);}},50);
  try{await this.waitUntil(()=>{const b=this.blockAt(block.position);return !!b&&b.stateId!==startId&&air(b);},90000,signal);}finally{clearInterval(sustaining);if(this.mining)this.breakAction={action:'abort_break',position:this.mining,face:1};this.mining=null;}
 }
 async place(target,item,signal){if(!air(this.blockAt(target)))throw Error('設置場所が空いていません');let support=null,face=0;
  const dirs=[[0,-1,0,1],[0,1,0,0],[-1,0,0,5],[1,0,0,4],[0,0,-1,3],[0,0,1,2]];
  for(const[x,y,z,f]of dirs){const b=this.blockAt(target.offset(x,y,z));if(solid(b)&&this.reach(b)){support=b;face=f;break;}}
  if(!support)throw Error('足場を置くための隣接ブロックがありません');if(/^(sand|red_sand|gravel|.*concrete_powder)$/.test(item.name)&&!solid(this.blockAt(target.offset(0,-1,0))))throw Error('砂系の足場は下に支えが必要です');
  await this.equip(item.slot);this.setControlState('sneak',true);this.lookAt(support.position.offset(.5,.5,.5),false);
  try{this.client.queue('inventory_transaction',useItem(this,'click_block',support.position,face,support.stateId));await this.waitUntil(()=>{const b=this.blockAt(target);return !!b&&!air(b)&&b.name===item.name;},6000,signal);}finally{this.setControlState('sneak',false);}
 }
 async openContainer(pos,signal){this.closeContainer();const b=this.blockAt(pos);if(!b||!this.reach(b))throw Error('チェストが届く範囲にありません');this.clearControlStates();this.lookAt(pos.offset(.5,.5,.5),false);this.client.queue('inventory_transaction',useItem(this,'click_block',pos,1,b.stateId));await this.waitUntil(()=>this.window?.ready,7000,signal);return this.window;}
 closeContainer(){if(this.window){this.client.queue('container_close',{window_id:this.window.id,window_type:this.window.type,server:false});this.window=null;}}
 async eat(signal){const food=this.find('enchanted_golden_apple');if(!food)throw Error('エンチャント金リンゴがなくなりました');this.clearControlStates();await this.equip(food.slot);const before=this.count('enchanted_golden_apple');this.usingItem=true;
  try{this.client.queue('inventory_transaction',useItem(this,'click_air',{x:0,y:0,z:0},-1));await this.waitUntil(()=>this.count('enchanted_golden_apple')<before,7000,signal);}finally{this.usingItem=false;}
 }
 async go(pos,signal){const goal=new pathfinder.GoalNear(pos.x+.5,pos.y,pos.z+.5,.6);if(goal.isEnd(this.entity.position))return;
  let timer;const navigation=this.pathfinder.goto(goal,{maxNodes:1500,tickDelay:1});
  const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{this.pathfinder.stop();reject(Error('移動がタイムアウトしました'));},15000);});
  try{await Promise.race([navigation,timeout]);if(signal?.aborted)throw Error('停止');}finally{clearTimeout(timer);this.pathfinder.stop();this.clearControlStates();}
 }
 respawn(){const p=this.respawnPacket;if(!p)throw Error('リスポーンの準備がまだです');this.client.queue('respawn',{position:p.position,state:2,runtime_entity_id:this._runtimeEntityId});this.client.queue('player_action',{runtime_entity_id:this._runtimeEntityId,action:'respawn',position:{x:0,y:0,z:0},result_position:{x:0,y:0,z:0},face:0});this.dead=false;this.health=null;this.respawnPacket=null;}
}
module.exports={BedrockBot};
