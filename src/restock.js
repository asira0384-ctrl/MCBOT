'use strict';
const crypto=require('node:crypto');
const {Vec3}=require('vec3');
const {air,solid,key}=require('./util');
const {desired}=require('./supply-needs');
function vec(p){return new Vec3(p.x,p.y,p.z);}
function boxes(bot,raw){const n=bot.nbt(raw);return n?.Items||n?.BlockEntityTag?.Items||n?.tag?.Items||null;}
function missing(runtime){
 const b=runtime.bot,c=runtime.config,out=[];
 if((c.crystalaura||c.pistoncrystal||c.jetpack)&&!b.find('end_crystal'))out.push('Crystal');
 if(c.heal&&!b.find('enchanted_golden_apple'))out.push('金リンゴ');
 if(c.autototem&&!/totem/.test(b.name(b.offhand?.[0]))&&!b.list().some(i=>/totem/.test(i.name)))out.push('Totem');
 if(c.feettrap&&!b.find('obsidian'))out.push('黒曜石');
 return out;
}
function nearbyChest(bot,radius=10){let best=null;const p=bot.entity.position;for(let x=Math.floor(p.x)-radius;x<=Math.floor(p.x)+radius;x++)for(let z=Math.floor(p.z)-radius;z<=Math.floor(p.z)+radius;z++)for(let y=Math.floor(p.y)-3;y<=Math.floor(p.y)+3;y++){const q=new Vec3(x,y,z);if(q.distanceTo(p)>radius)continue;if(bot.blockAt(q)?.name==='ender_chest'&&(!best||q.distanceTo(p)<best.distanceTo(p)))best=q;}return best;}
class Restock{
 constructor(runtime){this.runtime=runtime;this.worker=runtime.worker;this.bot=runtime.bot;this.state=this.worker.state;this.running=false;this.nextRequestAt=0;
  if(this.state.restock?.status==='running')this.state.restock.status='pending';
 }
 save(){this.runtime.manager.store.save();}
 request(reason,kind='kit',force=false){
  const current=this.state.restock;if(current&&['pending','approved','running','failed','paused'].includes(current.status))return current;
  if(!force&&Date.now()<this.nextRequestAt)return null;
  const job=this.state.restock={id:crypto.randomBytes(8).toString('hex'),status:'pending',reason,kind,at:Date.now(),phase:'approval',kitTaken:false,realm:{host:this.bot.config.host,port:this.bot.config.port,dimension:this.bot.dimensionId}};this.save();
  this.runtime.notice(`補充の許可待ち: ${reason}。${kind==='obsidian'?'エンダーチェスト1個を消費して黒曜石8個にします':'エンダーチェスト等から必要な物と最大1kitを補充します'}。Webの「補充を許可」で実行`,false);return job;
 }
 decide(id,approve){const job=this.state.restock;if(!job||job.id!==id||!['pending','failed','paused'].includes(job.status))throw Error('この補充通知は更新されています');job.status=approve?'approved':job.box||job.chest||job.position?'paused':'denied';job.error='';this.nextRequestAt=Date.now()+90000;if(approve){this.runtime.paused=false;this.worker.state.runtimePaused=false;}this.save();return approve?'今回の補充を許可しました':'今回の補充を見送りました';}
 scan(){if(this.running||!this.worker.state.autoSupply||this.runtime.paused||!this.bot.terrainReady)return;const list=missing(this.runtime);if(list.length)this.request(list.join('・')+'が不足',!this.bot.find('obsidian')&&this.runtime.config.obsidianFarm&&list.every(v=>v==='黒曜石')?'obsidian':'kit');if(this.runtime.config.obsidianFarm&&!this.bot.find('obsidian')&&this.bot.find('ender_chest'))this.request('黒曜石が0個','obsidian');}
 snapshot(){const j=this.state.restock;return j?{id:j.id,status:j.status,reason:j.reason,kind:j.kind,at:j.at,phase:j.phase,error:j.error||'',kitTaken:j.kitTaken}:null;}
 async approach(position,signal){const b=this.bot;if(b.reach({position}))return true;const p=b.entity.position;const goal=position.offset(Math.sign(p.x-position.x)*2,0,Math.sign(p.z-position.z)*2);await this.runtime.travel.walk(goal,'walk',signal);return b.reach({position});}
 async tick(signal){const j=this.state.restock;if(!j||!['approved','running'].includes(j.status)||this.running)return false;
  this.running=true;j.status='running';this.save();this.runtime.travel.unbury();this.runtime.travel.stopFollowing();
  try{if(j.realm&&(j.realm.host!==this.bot.config.host||j.realm.port!==this.bot.config.port||j.realm.dimension!==this.bot.dimensionId))throw Error('補充の世界・接続先が変わりました。元の場所の箱を手動確認してください');const complete=j.kind==='obsidian'?await this.obsidian(j,signal):await this.kit(j,signal);if(!complete)return true;j.status='done';j.phase='complete';this.nextRequestAt=Date.now()+90000;this.runtime.dirty=true;this.runtime.notice('許可された補充を完了しました',false);}
  catch(e){j.status='failed';j.error=e.message;this.runtime.notice('補充を中断: '+e.message+'。箱の進行情報を保持しました。Webで確認して再試行できます',false);}
  finally{this.bot.closeContainer();this.running=false;this.save();}return true;
 }
 async take(window,signal){return require('./supply-needs').takeNeeded(this.bot,window,this.runtime.config,signal,2);}
 async kit(j,signal){
  const b=this.bot,w=this.worker;
  // A manually handed shulker is also one permitted kit; never take a second.
  if(!j.chest&&!j.box){const carried=b.list().find(i=>/shulker_box$/.test(i.name)&&(!boxes(b,i.raw)||boxes(b,i.raw).length>0));if(carried){j.box={name:carried.name,stackId:carried.raw.stack_id,phase:'carried'};j.kitTaken=true;this.save();}}
  if(!j.chest&&!j.box){let p=nearbyChest(b),owned=false;if(!p){if(!b.find('ender_chest'))throw Error('エンダーチェストがありません。近くに設置するか手渡してください');if(!b.tool(true))throw Error('設置したエンダーチェストを回収するシルクタッチのツルハシが必要です');p=w.supplySpot();owned=true;j.chest={position:p,owned,phase:'placing'};this.save();await w.placeOwned(p,b.find('ender_chest'),'ender_chest',signal);}j.chest={position:p,owned,phase:'placed'};this.save();}
  if(j.chest&&!j.box&&!j.kitTaken){
   const p=vec(j.chest.position);j.phase='チェストへ移動';if(!await this.approach(p,signal))return false;
   if(b.blockAt(p)?.name!=='ender_chest')throw Error('記録したエンダーチェストを確認できません');const window=await b.openContainer(p,signal);await this.take(window,signal);
   const candidates=window.items.map((raw,slot)=>({raw,slot})).filter(i=>i.raw&&/shulker_box$/.test(b.name(i.raw))&&(!boxes(b,i.raw)||boxes(b,i.raw).length>0)).sort((a,c)=>{const score=raw=>(boxes(b,raw)||[]).reduce((sum,v)=>sum+(desired(b,String(v.Name||v.name||'').replace('minecraft:',''),{metadata:v.Damage||0},this.runtime.config)>0?1:0),0);return score(c.raw)-score(a.raw);});
   if(candidates.length){const {raw,slot}=candidates[0],free=b.items.findIndex(i=>!i);if(free<0||b.items.filter(i=>!i).length<3)throw Error('kitの設置・回収用に空き3枠が必要です');const before=new Set(b.list().filter(i=>/shulker_box$/.test(i.name)).map(i=>i.raw.stack_id));await b.transfer(true,slot,false,free,1);const item=b.list().find(i=>/shulker_box$/.test(i.name)&&!before.has(i.raw.stack_id))||b.list().find(i=>i.slot===free);j.box={name:b.name(raw),stackId:item?.raw.stack_id,phase:'carried',sourceSlot:slot};j.kitTaken=true;this.save();}
   b.closeContainer();if(!j.box)j.phase='loose-items-only';
  }
  if(j.box){const box=j.box;
   if(box.phase==='carried'){
    const item=b.list().find(i=>i.name===box.name&&i.raw.stack_id===box.stackId);if(!item)throw Error('取り出したkitを識別できません。手動確認してください');const p=w.supplySpot(j.chest?vec(j.chest.position):null);box.position=p;box.phase='placing';this.save();await w.placeOwned(p,item,'shulker',signal);box.phase='placed';this.save();
   }
   if(['placing','placed'].includes(box.phase)){
    const p=vec(box.position);if(!/shulker_box$/.test(b.blockAt(p)?.name||''))throw Error('kitの設置位置を確認してください');j.phase='kitから必要分を取得';const window=await b.openContainer(p,signal);if(window.items.length!==27)throw Error('kitの27枠を確認できません');await this.take(window,signal);box.empty=window.items.every(i=>!i||!i.network_id);b.closeContainer();box.phase='collecting';this.save();
   }
   if(box.phase==='collecting'){j.phase='kit回収';const item=await w.collectPlaced(vec(box.position),box.name,signal);box.stackId=item.raw.stack_id;box.phase='returning';this.save();}
   if(box.phase==='returning'){
    const item=b.list().find(i=>i.name===box.name&&i.raw.stack_id===box.stackId);if(!item)throw Error('回収したkitを識別できません');if(box.empty)await b.drop(item.slot,1);
    else {if(!j.chest&&b.find('ender_chest')&&b.tool(true)){const position=w.supplySpot(vec(box.position));j.chest={position,owned:true,phase:'placing'};this.save();await w.placeOwned(position,b.find('ender_chest'),'ender_chest',signal);j.chest.phase='placed';this.save();}
    if(j.chest){j.phase='中身入りkitを戻す';const window=await b.openContainer(vec(j.chest.position),signal),free=window.items.findIndex(i=>!i);if(free<0)throw Error('チェストが満杯です。kitを手元に保持しています');await b.transfer(false,item.slot,true,free,1);b.closeContainer();}else this.runtime.notice('中身入りkitを保持しています。エンダーチェストとシルクタッチのツルハシがあれば収納できます',false);}
    box.phase='returned';this.save();
   }
  }
  if(j.chest?.owned&&j.chest.phase!=='recovered'){j.phase='チェスト回収';await w.recoverChest(vec(j.chest.position),signal);j.chest.phase='recovered';this.save();}
  return true;
 }
 async obsidian(j,signal){
  const b=this.bot,w=this.worker;
  const tool=b.list().filter(i=>['diamond_pickaxe','netherite_pickaxe'].includes(i.name)&&!b.enchant(i.raw,'silk_touch',16)&&b.damage(i.raw)<(i.name==='netherite_pickaxe'?2021:1551))[0];if(!tool)throw Error('黒曜石回収用にシルクタッチなしのダイヤ・ネザライトのツルハシが必要です');
  if(!j.position){if(!b.find('ender_chest'))throw Error('消費するエンダーチェストがありません');if(!b.items.some(i=>!i))throw Error('回収用に空き1枠が必要です');j.position=w.supplySpot();j.before=b.count('obsidian');j.phase='チェストを1個設置';this.save();await w.placeOwned(vec(j.position),b.find('ender_chest'),'ender_chest',signal);j.phase='チェスト破壊';this.save();}
  const p=vec(j.position);if(b.blockAt(p)?.name==='ender_chest')await b.dig(b.blockAt(p),signal,tool);else if(!air(b.blockAt(p)))throw Error('消費用チェストの設置位置が変わりました');w.removeOwned(p);j.phase='黒曜石8個を回収';this.save();
  if(b.count('obsidian')<(j.before||0)+8&&solid(b.blockAt(p.offset(0,-1,0))))await b.go(p,signal);
  await b.waitUntil(()=>b.count('obsidian')>=(j.before||0)+8,6000,signal);return true;
 }
}
module.exports={Restock,missing,nearbyChest,boxes};
