'use strict';
const {randomUUID}=require('node:crypto');
const emotes=['4c8ae710-df2e-47cd-814d-cc7bf21a3d67','9a469a61-c83b-4ba9-b507-bdbe64430582','ce5c0300-7f03-455d-aaf1-352e4927b54d','5a5b2c0c-a924-4e13-a99b-4c12e3f02e1e','d863b9cc-9f8c-498b-a8a3-7ebd542cb08e','6bcf44bd-ff8a-48a5-9254-3983a0b0f702','946f04ea-8ff0-416e-a66d-8b0d0751e8bf'];
const norm=x=>String(x||'').normalize('NFKC').trim().toLowerCase();
function imported(d){
 if(![64,128].includes(d.size)||typeof d.rgba!=='string'||d.rgba.length!==4*Math.ceil(d.size*d.size*4/3))throw Error('64または128角のスキンPNGを指定');
 const data=Buffer.from(d.rgba,'base64');if(data.length!==d.size*d.size*4)throw Error('画像データ不正');
 const id=randomUUID();return {skin_id:id,full_skin_id:id,play_fab_id:'',skin_resource_pack:JSON.stringify({geometry:{default:'geometry.humanoid.custom'}}),skin_data:{width:d.size,height:d.size,data},animations:[],cape_data:{width:0,height:0,data:Buffer.alloc(0)},geometry_data:'',geometry_data_version:'',animation_data:'',cape_id:'',arm_size:'wide',skin_color:'#0',personal_pieces:[],piece_tint_colors:[],premium:false,persona:false,cape_on_classic:false,primary_user:true,overriding_player_appearance:false};
}
function attach(m,id,b){
 const c=b.client,cache=new Map(),names=new Map();let timer,last='',idx=0;
 const cfg=()=>m.store.bot(id).cosmetic||{};
 const updateFace=s=>{const f=require('./skin-face').face(s?.skin_data||s);if(f)b.hudFace=f;};
 function send(s){if(!s||!b.connected||b.ended||!c.profile?.uuid)return false;c.queue('player_skin',{uuid:c.profile.uuid,skin:s,skin_name:s.skin_id,old_skin_name:last,is_verified:false});updateFace(s);last=s.skin_id;return true;}
 function apply(){const v=cfg();return send(v.target?cache.get(norm(v.target)):v.image?imported(v.image):null);}
 function tick(){if(!b.connected||b.dead||b.ended)return;idx=(idx+1+Math.floor(Math.random()*(emotes.length-1)))%emotes.length;c.queue('emote',{entity_id:BigInt(b._runtimeEntityId),emote_id:emotes[idx],emote_length_ticks:0,xuid:String(c.profile?.xuid||''),platform_id:'',flags:0});}
 function restart(){clearInterval(timer);if(cfg().seconds&&b.connected&&!b.ended){tick();timer=setInterval(()=>{try{tick();}catch(e){clearInterval(timer);m.trace(id,e.message);}},cfg().seconds*1000);timer.unref();}}
 function remember(n,s){if(!n||!s?.skin_data?.data?.length||norm(n)===norm(b.username))return;cache.set(norm(n),s);if(norm(n)===norm(cfg().target))send(s);}
 c.on('player_list',p=>{const r=p.records;for(const e of Array.isArray(r)?r:r?.records||[]){if((e.type||r.type)==='remove'){cache.delete(names.get(e.uuid));names.delete(e.uuid);}else{names.set(e.uuid,norm(e.username));if(String(e.uuid)===c.profile?.uuid||norm(e.username)===norm(c.profile?.name||b.username))updateFace(e.skin_data||e.skin);else remember(e.username,e.skin_data||e.skin);}}});
 c.on('player_skin',p=>String(p.uuid)===c.profile?.uuid?updateFace(p.skin):remember(names.get(p.uuid),p.skin));b.on('spawn',()=>{if(!b.hudFace){try{const s=JSON.parse(Buffer.from(c.clientUserChain.split('.')[1],'base64url'));updateFace({width:s.SkinImageWidth,height:s.SkinImageHeight,data:s.SkinData});}catch{}}apply();restart();});b.on('end',()=>{clearInterval(timer);cache.clear();names.clear();});b.cosmetics={apply,restart};
}
function set(m,id,cmd,value){const v=m.store.bot(id).cosmetic??={};const b=m.workers.get(id)?.bot;
 if(cmd==='autoemote'){const n=value==='off'?0:Number(value);if(value!=='off'&&(!Number.isInteger(n)||n<1||n>3600))throw Error('1〜3600秒 または off');v.seconds=n;m.store.save();b?.cosmetics?.restart();return n?n+'秒ごとにエモート':'エモート停止';}
 if(cmd==='skinimport'){imported(value);v.image=value;delete v.target;}else if(value==='off'){delete v.target;delete v.image;}else{if(!/^[a-z0-9 _-]{1,32}$/i.test(value))throw Error('MCIDを確認');v.target=value;delete v.image;}m.store.save();return b?.cosmetics?.apply()?'スキン変更を送信':value==='off'?'スキン追従停止':'設定保存・接続または対象スキンの受信待ち';}
module.exports={attach,set,imported};
