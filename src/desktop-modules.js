'use strict';
const R=(n,v,lo,hi,step=1)=>[n,'range',v,lo,hi,step],T=(n,v='')=>[n,'text',v],B=(n,v)=>[n,'checkbox',v],E=(n,v,a)=>[n,'select',v,a];
const catalog={
 KillAura:{group:'Combat',cmd:'killaura',key:'killaura',settings:[R('Reach',5,2,6,.1),R('Attack Delay',75,25,1000)]},
 CrystalAura:{group:'Combat',cmd:'crystalaura',key:'crystalaura',settings:[R('Reach',5,2,6,.1),R('Place Delay',50,0,1000),R('Break Delay',25,0,1000)]},
 PistonCrystal:{group:'Combat',cmd:'pistoncrystal',key:'pistoncrystal',settings:[R('Reach',5,2,6,.1)]},
 AntiCrystal:{group:'Combat',cmd:'anticrystal',key:'anticrystal',settings:[R('Depth',.55,.05,.8,.05)]},
 FeetTrap:{group:'Combat',cmd:'feettrap',key:'feettrap',settings:[]},
 Assist:{group:'Combat',cmd:'assist',key:'assist',settings:[]},
 AttackAll:{group:'Combat',cmd:'attackall',key:'attackAll',settings:[]},
 AutoTotem:{group:'Player',cmd:'autototem',key:'autototem',settings:[]},
 AutoArmor:{group:'Player',cmd:'gear',key:'gear',settings:[]},
 AutoSlot:{group:'Player',cmd:'autoslot',key:'autoslot',settings:[]},
 AutoEat:{group:'Player',cmd:'heal',key:'heal',settings:[R('Health',16,1,20)]},
 AutoLog:{group:'Player',cmd:'autolog',key:'autolog',settings:[R('Health',8,1,19),E('Condition','empty-health',['pop','empty','health','empty-health']),B('Absorption',false)]},
 Inventory:{group:'Player',action:true,settings:[]},
 Follow:{group:'Movement',settings:[T('Target'),E('Mode','direct',['direct','trail']),R('Distance',2,1,10,.5)]},
 AutoWalk:{group:'Movement',settings:[E('Dimension','overworld',['overworld','nether','end']),T('X','0'),T('Y','64'),T('Z','0')]},
 Jetpack:{group:'Movement',cmd:'jetpack',key:'jetpack',settings:[]},
 Scaffold:{group:'Movement',cmd:'scaffold',settings:[]},
 Orbit:{group:'Movement',settings:[E('Center','Player',['Player','Coordinates']),T('Target'),T('X','0'),T('Y','64'),T('Z','0'),R('Radius',3,.5,32,.1),R('Angular Speed',.5,.1,2,.1),E('Direction','Clockwise',['Clockwise','Counterclockwise']),B('Jump',false)]},
 Circle:{group:'Movement',settings:[E('Center','Player',['Player','Coordinates']),T('Target'),T('X','0'),T('Y','64'),T('Z','0'),R('Radius',3,.5,32,.1),B('Jump',false)]},
 Velocity:{group:'Exploit',cmd:'velocity',key:'velocity',settings:[R('Horizontal',0,0,100),R('Vertical',0,0,100)]},
 AutoTPA:{group:'Exploit',settings:[T('Target')]},
 CustomCommand:{group:'Exploit',action:true,settings:[T('Command','/help')]},
 Nuke:{group:'World',settings:[T('Min X','0'),T('Max X','16'),T('Min Z','0'),T('Max Z','16'),R('Floor',0,-64,318),R('Ceiling',127,-63,319),R('Range',5,1,6,.1)]},
 Supply:{group:'World',cmd:'supply',settings:[]},
 Gemini:{group:'Chat',settings:[E('Access','list',['list','all']),T('Allowed Players'),T('Model','gemini-3.1-flash-lite'),T('City','Tokyo'),B('Debug',false)]},
 Greeter:{group:'Chat',settings:[T('Players'),T('Join','Hello @player!'),T('Leave'),T('Chat'),E('Delivery','all',['all','rotate'])]},
 AutoReply:{group:'Chat',settings:[T('Players'),T('Messages')]},
 ChatQueue:{group:'Chat',action:true,settings:[]},
 ChatLog:{group:'Chat',cmd:'gamelogs',settings:[]},
 AutoEmote:{group:'Misc',settings:[R('Interval',10,1,120)]},
 SkinStealer:{group:'Misc',settings:[T('Player')]}
};
const runtimeFields={'Reach':['range',2,6],'Attack Delay':['attackDelay',25,1000],'Place Delay':['crystalPlaceDelay',0,1000],'Break Delay':['crystalBreakDelay',0,1000],'Depth':['burrowDepth',.05,.8],'Horizontal':['velocityHorizontal',0,100],'Vertical':['velocityVertical',0,100]};
const allowedRuntime={KillAura:['Reach','Attack Delay'],CrystalAura:['Reach','Place Delay','Break Delay'],PistonCrystal:['Reach'],AntiCrystal:['Depth'],Velocity:['Horizontal','Vertical']};
const fail=m=>Object.assign(Error(m),{status:400});
function validate(name,raw){const c=catalog[name];if(!c)throw fail('対応していないモジュールです');const v={};for(const [k,t,def,lo,hi,step]of c.settings){const x=raw?.[k]??def;if(t==='range'){if(typeof x!=='number'||!Number.isFinite(x)||x<lo||x>hi)throw fail(k+'の範囲を確認してください');v[k]=x;}else if(t==='checkbox'){if(typeof x!=='boolean')throw fail(k+'はON/OFFです');v[k]=x;}else if(t==='select'){if(!lo.includes(x))throw fail(k+'を選択してください');v[k]=x;}else {if(typeof x!=='string'||x.length>1000||/[\x00-\x09\x0b-\x1f]/.test(x))throw fail(k+'が不正です');v[k]=x.trim();}}return v;}
function snapshot(m){return [...m.names.keys()].map(id=>{const s=m.store.bot(id),w=m.workers.get(id),cfg={...require('./runtime').defaults,...s.runtime},states={},values={};for(const [n,c]of Object.entries(catalog)){states[n]=c.key?!!cfg[c.key]:false;let v=values[n]={};for(const k of allowedRuntime[n]||[])v[k]=cfg[runtimeFields[k][0]];}
 Object.assign(states,{Scaffold:s.scaffoldEnabled!==false,Supply:s.autoSupply!==false,Follow:!!s.follow?.enabled,AutoWalk:!!w?.runtime?.travel?.route,Nuke:!!w?.running,AutoEmote:!!s.cosmetic?.seconds,SkinStealer:!!s.cosmetic?.target,Greeter:!!s.greeting?.enabled,AutoReply:!!s.replies?.enabled,ChatLog:require('./game-logs').settings(s).enabled!==false,Gemini:m.store.data.desktopAIEnabled!==false,AutoTPA:!!m.tpJobs?.[m.realm(id)]?.active});
 for(const n of ['Circle','Orbit']){const c=m.circles?.[m.realm(id)];states[n]=!!c&&!!c.orbit===(n==='Orbit')&&!c.excluded.has(id);if(c)values[n]={Center:c.centerMode||'Player',Target:c.name||'',X:String(c.x??0),Y:String(c.y??64),Z:String(c.z??0),Radius:c.radius,'Angular Speed':c.speed||.5,Direction:c.direction===-1?'Counterclockwise':'Clockwise',Jump:!!c.jump};}
 Object.assign(values.AutoEat,{Health:cfg.healHearts*2});Object.assign(values.AutoLog,{Health:cfg.logHearts*2,Condition:cfg.logMode||'empty-health',Absorption:!!cfg.logAbsorption});
 values.AutoEmote={Interval:s.cosmetic?.seconds||10};values.SkinStealer={Player:s.cosmetic?.target||''};values.Follow={Target:s.follow?.name||'',Mode:s.follow?.mode||'direct',Distance:s.follow?.distance||2};
 values.Nuke={'Min X':String(s.area?.x1??0),'Max X':String(s.area?.x2??16),'Min Z':String(s.area?.z1??0),'Max Z':String(s.area?.z2??16),Floor:s.floor??0,Ceiling:s.ceiling??127,Range:s.miningRange??5};
 values.Greeter={Players:s.greeting?.targets?.join('\n')||'',Join:s.greeting?.join?.join('\n')||'',Leave:s.greeting?.leave?.join('\n')||'',Chat:s.greeting?.chat?.join('\n')||'',Delivery:s.greeting?.delivery||'all'};
 values.AutoReply={Players:s.replies?.targets?.join('\n')||'',Messages:s.replies?.messages?.join('\n')||''};
 const ai=require('./game-ai').settings(m.store);values.Gemini={Access:ai.mode,'Allowed Players':ai.allow.join('\n'),Model:ai.model,City:ai.city,Debug:ai.debug};
 return {id,states,values};});}
async function apply(web,session,d){
 if(typeof d.module!=='string'||!Object.hasOwn(catalog,d.module)||!(typeof d.enabled==='boolean'||d.enabled===null))throw fail('モジュールとON/OFFを指定してください');
 const m=web.manager,n=d.module,c=catalog[n],v=validate(n,d.values),ids=web.targets(d.target),on=d.enabled; if(!ids.length)throw fail('Botを選択してください');
 const owner=()=>web.requireOwner(session);
 const cmd=(id,text)=>m.execute(String(id),text,'web');
 const coord=k=>{const x=Number(v[k]);if(!Number.isFinite(x)||Math.abs(x)>30000000)throw fail(k+'座標を確認してください');return x;};
 if(n==='Nuke'){['Min X','Max X','Min Z','Max Z'].forEach(k=>{if(!Number.isInteger(coord(k)))throw fail('採掘座標は整数です')});if(v.Floor>=v.Ceiling)throw fail('FloorはCeiling未満です');}
 if(n==='AutoWalk')for(const k of ['X','Y','Z'])coord(k);
 if(['CustomCommand','AutoTPA','Gemini'].includes(n))owner();
 if(n==='Gemini'){const old=require('./game-ai').settings(m.store);require('./game-ai').configure(m.store,{mode:v.Access,allow:v['Allowed Players'],notes:old.notes.join('\n'),city:v.City,model:v.Model,key:'',debug:v.Debug});if(on!==null)m.store.data.desktopAIEnabled=on;m.store.save();return {ok:true,result:'Gemini設定を保存しました'};}
 if(n==='AutoTPA'){const realms=[...new Set(ids.map(id=>m.realm(id)))];if(on===null&&!realms.some(realm=>m.tpJobs?.[realm]?.active))return {ok:true,result:'開始時にTP先を適用します'};for(const realm of realms)require('./fleet-teleport').start(m,{realm,name:v.Target,action:on===false?'stop':'start'});return {ok:true,result:'順番TP操作を受け付けました'};}
 if(n==='Orbit'||n==='Circle'){const realms=[...new Set(ids.map(id=>m.realm(id)))];if(realms.length!==1)throw fail('IGNか2b2eを選択してください');if(on===null&&!m.circles?.[realms[0]])return {ok:true,result:'開始時に設定を適用します'};
 require('./circle').configure(m,{realm:realms[0],action:on===false?'stop':'start',centerMode:v.Center,name:v.Target,x:coord('X'),y:coord('Y'),z:coord('Z'),radius:v.Radius,orbit:n==='Orbit',jump:v.Jump,speed:v['Angular Speed']||.5,direction:v.Direction});return {ok:true,result:'Circle/Orbitを更新しました（同サーバーのオンラインBotが参加）'};}
 const results=[];
 for(const id of ids){try{
 const s=m.store.bot(id),w=m.workers.get(id);let lines=[];
 if(allowedRuntime[n]){const cfg=s.runtime??=Object.assign({},require('./runtime').defaults);for(const k of allowedRuntime[n])cfg[runtimeFields[k][0]]=v[k];if(w?.runtime)Object.assign(w.runtime.config,cfg);}
 if(c.cmd&&on!==null){let text=c.cmd+' '+(on?'on':'off');if(n==='AntiCrystal'&&on)text='anticrystal '+v.Depth;if(n==='Velocity')text+=' '+v.Horizontal+' '+v.Vertical;if(n==='ChatLog')text='gamelogs all '+(on?'on':'off');lines.push(await cmd(id,text));}
 if(n==='AutoEat')lines.push(await cmd(id,'heal '+(on===null?(s.runtime?.heal?'on':'off'):on?'on':'off')+' '+v.Health/2));
 if(n==='AutoLog'){lines.push(await cmd(id,'autolog '+(on===null?(s.runtime?.autolog?'on':'off'):on?'on':'off')+' '+v.Health/2));lines.push(await cmd(id,'autolog mode '+v.Condition));lines.push(await cmd(id,'autolog absorption '+(v.Absorption?'on':'off')));}
 if(n==='Follow'){lines.push(await cmd(id,'follow distance '+v.Distance));lines.push(await cmd(id,'follow mode '+v.Mode));if(on!==null||s.follow?.enabled)lines.push(await cmd(id,on===false?'follow off':'follow '+v.Target));}
 if(n==='AutoWalk'&&on!==null)lines.push(await cmd(id,on?'goto walk '+v.Dimension+' '+['X','Y','Z'].map(coord).join(' '):'stop'));
 if(n==='Nuke'){if(on!==false){lines.push(await cmd(id,'area '+['Min X','Min Z','Max X','Max Z'].map(coord).join(' ')));if(s.floor!==null&&s.floor>=v.Ceiling)lines.push(await cmd(id,'floor -64'));lines.push(await cmd(id,'ceiling '+v.Ceiling));lines.push(await cmd(id,'floor '+v.Floor));lines.push(await cmd(id,'miningrange '+v.Range));}if(on!==null)lines.push(await cmd(id,on?'start':'stop'));}
 if(n==='AutoEmote')lines.push(await cmd(id,'autoemote '+(on===false?'off':on===null&&!s.cosmetic?.seconds?'off':v.Interval)));
 if(n==='SkinStealer'&&(on!==null||s.cosmetic?.target))lines.push(await cmd(id,'skinstealer '+(on===false?'off':v.Player)));
 if(n==='Greeter'||n==='AutoReply'){const section=n==='Greeter'?'greeting':'replies',old=require('./messaging').config(m,id,section,w?.bot),enabled=on===null?old.enabled:on;require('./messaging').configure(m,[id],section,n==='Greeter'?{enabled,targets:v.Players,join:v.Join,leave:v.Leave,chat:v.Chat,delivery:v.Delivery}:{enabled,targets:v.Players,messages:v.Messages});lines.push('チャット設定を保存しました');}
 if(n==='CustomCommand'){if(on!==false){require('./fleet-teleport').send(m.worker(id).bot,v.Command);lines.push('ゲームコマンドを送信キューへ登録しました');}}
 (s.desktopSettings??={})[n]=v;results.push({id,ok:true,result:lines.join(' / ')||'設定を保存しました'});m.changed?.(id,'desktop');
 }catch(e){results.push({id,ok:false,result:e.message});}}
 m.store.save();return {ok:results.every(r=>r.ok),results,result:results.map(r=>'Bot'+r.id+': '+r.result).join('\n')};
}
module.exports={catalog,validate,snapshot,apply};
