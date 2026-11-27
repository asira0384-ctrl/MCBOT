'use strict';
const R=(n,v,lo,hi,step=1)=>[n,'range',v,lo,hi,step],T=(n,v='')=>[n,'text',v],B=(n,v)=>[n,'checkbox',v],E=(n,v,a)=>[n,'select',v,a];
const catalog={
 MobAura:{group:'Combat',settings:[R('Range',4,1,6,.1),R('Chase Range',16,4,32,1),R('Attack Delay',500,100,2000,25),E('Weapon','Auto',['Auto','Sword','Axe']),E('Targets','Hostile',['Hostile','All Mobs'])]},
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
 EatStop:{group:'Player',key:'eatStop',settings:[]},
 AutoLog:{group:'Player',cmd:'autolog',key:'autolog',settings:[R('Health',8,1,19),E('Condition','empty-health',['pop','empty','health','empty-health']),B('Absorption',false)]},
 Inventory:{group:'Player',action:true,settings:[]},
 Follow:{group:'Movement',settings:[T('Target'),E('Mode','direct',['direct','trail']),R('Distance',2,1,10,.5)]},
 AutoWalk:{group:'Movement',settings:[E('Dimension','overworld',['overworld','nether','end']),T('X','0'),T('Y','64'),T('Z','0')]},
 Jetpack:{group:'Movement',cmd:'jetpack',key:'jetpack',settings:[]},
 Scaffold:{group:'Movement',cmd:'scaffold',settings:[]},
 Orbit:{group:'Movement',settings:[E('Center','Player',['Player','Coordinates']),T('Target'),T('X','0'),T('Y','64'),T('Z','0'),R('Radius',3,.5,32,.1),R('Angular Speed',.5,.1,2,.1),E('Direction','Clockwise',['Clockwise','Counterclockwise']),B('Jump',false)]},
 Circle:{group:'Movement',settings:[E('Center','Player',['Player','Coordinates']),T('Target'),T('X','0'),T('Y','64'),T('Z','0'),R('Radius',3,.5,32,.1),B('Jump',false)]},
 Velocity:{group:'Movement',cmd:'velocity',key:'velocity',settings:[R('Horizontal',0,0,100),R('Vertical',0,0,100)]},
 AutoTPA:{group:'Exploit',settings:[T('Target')]},
 CustomCommand:{group:'Exploit',action:true,settings:[T('Command','/help')]},
 Nuke:{group:'World',settings:[T('Start X','0'),T('Start Y','1'),T('Start Z','0'),T('End X','16'),T('End Y','127'),T('End Z','16'),R('Range',5,1,6,.1),T('Blocks','all'),B('Dash',true),B('LavaMode',true),B('Chunk Break',false),B('ItemDrop',true),B('Scaffold',true),T('Scaffold Block','cobblestone'),R('Max Drop',64,1,64)]},
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

const extraSettings={KillAura:[R('Chase Range',30,5,64,.5),R('Chase Speed',.27,0,.5,.01),R('Block Reach',5,2,6,.1)],CrystalAura:[R('Block Reach',5,2,6,.1),R('Predict Packets',10,0,10),R('Chase Range',30,5,64,.5)],PistonCrystal:[R('Block Reach',5,2,6,.1),R('Break Delay',25,0,1000),R('Place Delay',50,0,1000),R('Predict Packets',10,0,10)],FeetTrap:[R('Block Reach',5,2,6,.1)]};
Object.assign(runtimeFields,{'Chase Range':['chaseRange',5,64],'Chase Speed':['chaseSpeed',0,.5],'Block Reach':['blockReach',2,6],'Predict Packets':['crystalPredict',0,10]});
for(const [name,settings]of Object.entries(extraSettings)){catalog[name].settings.push(...settings);allowedRuntime[name]??=[];allowedRuntime[name].push(...settings.map(x=>x[0]));}
for(const [name,cmd,key,settings]of [
 ['Speed','speed','chaseSpeed',[R('Speed',.27,0,.5,.01)]],['Timer','timer','straightTimer',[R('Multiplier',.24,0,.5,.01)]],['LavaWalk','lava','lavaWalk',[R('Lava Speed',.24,.05,.5,.01)]],['NoSlow','noslow','noSlow',[R('Eat Speed',.12,.01,.3,.01)]],
 ['AutoRespawn','respawn',null,[]],['AutoKit','autokit',null,[T('Kit')]],['AutoBack','autoback',null,[]],['AutoWorld','autoworld',null,[T('World')]]
 ])catalog[name]={group:['AutoRespawn','AutoKit','AutoBack','AutoWorld'].includes(name)?'Player':'Movement',cmd,key,settings};
catalog.Speed.key=null;catalog.Timer.key=null;
catalog.ElytraFly={group:'Movement',settings:[E('Dimension','overworld',['overworld','nether','end']),T('X','0'),T('Y','80'),T('Z','0'),R('Horizontal',1.5,.01,3,.01),R('Vertical',.7,.01,1.5,.01)]};

catalog.ChatSuffix={group:'Chat',settings:[T('Suffix',' | Asira'),B('Fancy Text',false),B('Green Text',false),B('Random Text',false),R('Min Length',4,1,24),R('Max Length',8,1,24),B('Private Chat',false)]};
const spamFields=[T('Messages'),R('Interval',1,.1,120,.1),B('Random Interval',false),R('Max Interval',2,.1,120,.1),B('Random Text',false),B('Random Only',false),R('Random Length',6,1,180)];
catalog.Spam={group:'Chat',settings:spamFields};
catalog.TellSpam={group:'Chat',settings:[T('Player'),...spamFields]};
catalog.ChatQueue.settings=[R('Send Interval',5,5,120,.5),R('Maximum',6,1,30)];
catalog.Scaffold.group='World';catalog.AutoTPA.group='Misc';
catalog.Jetpack.settings=[R('Speed',1.4,.1,3,.1),R('Minimum Health',12,2,40)];
allowedRuntime.Jetpack=['Speed','Minimum Health'];runtimeFields.Speed=['jetpackSpeed',.1,3];runtimeFields['Minimum Health']=['jetpackHealth',2,40];
for(const n of ['KillAura','CrystalAura','PistonCrystal'])catalog[n].settings.push(E('Targets','Enemies',['Enemies','All Players']));

for(const n of ['KillAura','CrystalAura','PistonCrystal']){catalog[n].settings.push(B('Rotate',true),R('Rotation Delay',0,0,500,5));}

catalog.Offhand={...catalog.AutoTotem,settings:[B('Packet',true),B('Spam',false),R('Interval',0,0,2000,10)]};delete catalog.AutoTotem;
const fail=m=>Object.assign(Error(m),{status:400});
function validate(name,raw){const c=catalog[name];if(!c)throw fail('Unsupported module');const v={};for(const [k,t,def,lo,hi,step]of c.settings){let x=raw?.[k]??def;if(typeof x==='string'&&['Messages','Join','Leave','Chat','Allowed Players'].includes(k))x=x.replace(/\r\n/g,'\n');if(t==='range'){if(typeof x!=='number'||!Number.isFinite(x)||x<lo||x>hi)throw fail(k+' is outside its allowed range');v[k]=x;}else if(t==='checkbox'){if(typeof x!=='boolean')throw fail(k+' must be ON or OFF');v[k]=x;}else if(t==='select'){if(!lo.includes(x))throw fail(k+' must be selected');v[k]=x;}else {if(typeof x!=='string'||x.length>1000||/[\x00-\x09\x0b-\x1f]/.test(x))throw fail(k+' is invalid');v[k]=['Suffix','Messages','Join','Leave','Chat'].includes(k)?x:x.trim();}}return v;}
function snapshot(m){return [...m.names.keys()].map(id=>{const s=m.store.bot(id),w=m.workers.get(id),cfg={...require('../../src/app/runtime').defaults,...s.runtime},states={},values={};for(const [n,c]of Object.entries(catalog)){states[n]=c.key?!!cfg[c.key]:false;let v=values[n]={};for(const k of allowedRuntime[n]||[])v[k]=cfg[runtimeFields[k][0]];}
 Object.assign(states,{ChatSuffix:require('../../model/chat/delivery/chat-suffix').settings(s).enabled,Spam:!!s.desktopSpam?.enabled,TellSpam:!!s.desktopTellSpam?.enabled,Scaffold:s.scaffoldEnabled!==false,Supply:s.autoSupply!==false,Follow:!!s.follow?.enabled,AutoWalk:!!w?.runtime?.travel?.route&&w.runtime.travel.route.mode==='walk',ElytraFly:!!w?.runtime?.travel?.route&&w.runtime.travel.route.mode==='fly',Speed:cfg.chaseSpeed>0,Timer:cfg.straightTimer>0,AutoRespawn:s.respawn!==false,AutoKit:!!s.ignActions?.autoKit,AutoBack:!!s.ignActions?.autoBack,AutoWorld:!!s.ignActions?.autoWorld,Nuke:!!(s.nukeEnabled||w?.running||w?.startRequested),AutoEmote:!!s.cosmetic?.seconds,SkinStealer:!!s.cosmetic?.target,Greeter:!!s.greeting?.enabled,AutoReply:!!s.replies?.enabled,ChatLog:require('../../src/diagnostics/game-logs').settings(s).enabled!==false,Gemini:m.store.data.desktopAIEnabled!==false,AutoTPA:!!m.tpJobs?.[m.realm(id)]?.active&&(!m.tpJobs[m.realm(id)].ids||m.tpJobs[m.realm(id)].ids.includes(id))});
 for(const n of ['Circle','Orbit']){const c=m.circles?.[m.realm(id)];states[n]=!!c&&!!c.orbit===(n==='Orbit')&&!c.excluded.has(id);if(c)values[n]={Center:c.centerMode||'Player',Target:c.name||'',X:String(c.x??0),Y:String(c.y??64),Z:String(c.z??0),Radius:c.radius,'Angular Speed':c.speed||.5,Direction:c.direction===-1?'Counterclockwise':'Clockwise',Jump:!!c.jump};}
 Object.assign(values.AutoEat,{Health:cfg.healHearts*2});Object.assign(values.AutoLog,{Health:cfg.logHearts*2,Condition:cfg.logMode||'empty-health',Absorption:!!cfg.logAbsorption});
 values.Speed={Speed:cfg.chaseSpeed};values.Timer={Multiplier:cfg.straightTimer};values.LavaWalk={'Lava Speed':cfg.lavaSpeed};values.NoSlow={'Eat Speed':cfg.eatSpeed};values.AutoKit={Kit:s.ignActions?.kitName||''};values.AutoWorld={World:s.ignActions?.worldName||''};values.ElytraFly={...values.ElytraFly,Horizontal:cfg.flyHorizontal,Vertical:cfg.flyVertical};values.AutoEmote={Interval:s.cosmetic?.seconds||10};values.SkinStealer={Player:s.cosmetic?.target||''};values.Follow={Target:s.follow?.name||'',Mode:s.follow?.mode||'direct',Distance:s.follow?.distance||2};
 states.MobAura=!!s.mobAura?.enabled;values.MobAura={Range:s.mobAura?.range??4,'Chase Range':s.mobAura?.chaseRange??16,'Attack Delay':s.mobAura?.delay??500,Weapon:s.mobAura?.weapon||'Auto',Targets:s.mobAura?.targets||'Hostile'};
 values.Nuke=require('../../model/world/nuke').values(s);
 values.Greeter={Players:s.greeting?.targets?.join('\n')||'',Join:s.greeting?.join?.join('\n')||'',Leave:s.greeting?.leave?.join('\n')||'',Chat:s.greeting?.chat?.join('\n')||'',Delivery:s.greeting?.delivery||'all'};
 values.AutoReply={Players:s.replies?.targets?.join('\n')||'',Messages:s.replies?.messages?.join('\n')||''};
 const ai=require('../../model/chat/ai/game-ai').settings(m.store);values.Gemini={Access:ai.mode,'Allowed Players':ai.allow.join('\n'),Model:ai.model,City:ai.city,Debug:ai.debug};
 states.Offhand=!!cfg.autototem;values.Offhand={Packet:cfg.offhandPacket!==false,Spam:!!cfg.offhandSpam,Interval:cfg.offhandInterval??0};values.ChatSuffix={Suffix:require('../../model/chat/delivery/chat-suffix').settings(s).suffix,'Fancy Text':!!s.chatSuffix?.fancy,'Green Text':!!s.chatSuffix?.green,'Random Text':!!s.chatSuffix?.random,'Min Length':s.chatSuffix?.min||4,'Max Length':s.chatSuffix?.max||8,'Private Chat':!!s.chatSuffix?.whisper};for(const [n,k] of [['Spam','desktopSpam'],['TellSpam','desktopTellSpam']]){const a=s[k]||{};values[n]={Player:a.player||'',Messages:a.messages?.join('\n')||'',Interval:a.interval||10,'Random Text':!!a.random,'Random Length':a.randomLength||6,'Random Only':!!a.randomOnly,'Random Interval':!!a.randomInterval,'Max Interval':a.maxInterval||2};}
 values.AutoTPA=s.desktopSettings?.AutoTPA||{Target:''};values.ChatQueue={'Send Interval':s.desktopChatQueue?.interval||5,Maximum:s.desktopChatQueue?.maximum||6};
 values.Jetpack={Speed:cfg.jetpackSpeed??1.4,'Minimum Health':cfg.jetpackHealth??12};
 for(const n of ['KillAura','CrystalAura','PistonCrystal'])values[n].Targets=cfg.attackAll?'All Players':'Enemies';for(const n of ['KillAura','CrystalAura','PistonCrystal']){values[n].Rotate=cfg[n==='KillAura'?'rotateKA':n==='CrystalAura'?'rotateCA':'rotatePA']!==false;values[n]['Rotation Delay']=cfg[n==='KillAura'?'rotateDelayKA':n==='CrystalAura'?'rotateDelayCA':'rotateDelayPA']??0;}return {id,states,values};});}
async function apply(web,session,d){
 if(typeof d.module!=='string'||!Object.hasOwn(catalog,d.module)||!(typeof d.enabled==='boolean'||d.enabled===null))throw fail('Specify a module and its ON/OFF state');
 const m=web.manager,n=d.module,c=catalog[n],v=validate(n,d.values),ids=web.targets(d.target),on=d.enabled; if(!ids.length)throw fail('Select bots');
 const owner=()=>web.requireOwner(session);
 const cmd=(id,text)=>m.execute(String(id),text,'web');
 const coord=k=>{const x=Number(v[k]);if(!Number.isFinite(x)||Math.abs(x)>30000000)throw fail(k+' coordinate is invalid');return x;};

 if(n==='AutoWalk'||n==='ElytraFly')for(const k of ['X','Y','Z'])coord(k);
 if(['CustomCommand','AutoTPA','Gemini'].includes(n))owner();
 if(n==='Gemini'){const old=require('../../model/chat/ai/game-ai').settings(m.store);require('../../model/chat/ai/game-ai').configure(m.store,{mode:v.Access,allow:v['Allowed Players'],notes:old.notes.join('\n'),city:v.City,model:v.Model,key:'',debug:v.Debug});if(on!==null)m.store.data.desktopAIEnabled=on;m.store.save();return {ok:true,result:'IGNGPT settings saved'};}
 if(n==='AutoTPA'){for(const id of ids)(m.store.bot(id).desktopSettings??={}).AutoTPA=v;m.store.save();const realms=[...new Set(ids.map(id=>m.realm(id)))];if(on===null)return {ok:true,result:'AutoTPA settings saved'};const results=realms.map(realm=>{try{require('../../model/server/actions/fleet-teleport').start(m,{realm,name:v.Target,ids:ids.filter(id=>m.realm(id)===realm),action:on===false?'stop':'start'});return {realm,ok:true};}catch(e){return {realm,ok:false,error:e.message};}});return {ok:results.every(r=>r.ok),results,result:results.map(r=>r.realm+': '+(r.ok?'AutoTPA started':r.error)).join(' / ')};}

 if(n==='Orbit'||n==='Circle'){const realms=[...new Set(ids.map(id=>m.realm(id)))];if(realms.length!==1)throw fail('Select IGN or 2b2e');if(on===null&&!m.circles?.[realms[0]])return {ok:true,result:'Settings will apply when enabled'};
 require('../../model/movement/circle/circle').configure(m,{realm:realms[0],action:on===false?'stop':'start',centerMode:v.Center,name:v.Target,x:coord('X'),y:coord('Y'),z:coord('Z'),radius:v.Radius,orbit:n==='Orbit',jump:v.Jump,speed:v['Angular Speed']||.5,direction:v.Direction});return {ok:true,result:'Circle/Orbit updated for online bots on the same server'};}
 const results=[];
 for(const id of ids){try{
 const s=m.store.bot(id),w=m.workers.get(id);let lines=[];
 if(allowedRuntime[n]){const cfg=s.runtime??=Object.assign({},require('../../src/app/runtime').defaults);for(const k of allowedRuntime[n])cfg[runtimeFields[k][0]]=v[k];if(w?.runtime)Object.assign(w.runtime.config,cfg);}
 if(['KillAura','CrystalAura','PistonCrystal'].includes(n)){const cfg=s.runtime??=Object.assign({},require('../../src/app/runtime').defaults);cfg[n==='KillAura'?'rotateKA':n==='CrystalAura'?'rotateCA':'rotatePA']=v.Rotate;cfg[n==='KillAura'?'rotateDelayKA':n==='CrystalAura'?'rotateDelayCA':'rotateDelayPA']=v['Rotation Delay'];cfg.attackAll=v.Targets==='All Players';if(on===true&&w?.runtime){const ring=m.circles?.[m.realm(id)];ring?.excluded.add(id);if(w.runtime.circle)w.runtime.travel.stopFollowing();w.runtime.circle=null;w.runtime.follower?.stop();}if(w?.runtime)Object.assign(w.runtime.config,cfg);}
 if(n==='ChatSuffix'){if(v['Min Length']>v['Max Length']||v.Suffix.length>80)throw fail('Suffix must be at most 80 characters; Min must not exceed Max');s.chatSuffix={enabled:on===null?!!s.chatSuffix?.enabled:on,suffix:v.Suffix,fancy:v['Fancy Text'],green:v['Green Text'],random:v['Random Text'],min:Math.round(v['Min Length']),max:Math.round(v['Max Length']),whisper:v['Private Chat']};lines.push('ChatSuffix updated');}
 if(n==='Spam'||n==='TellSpam'){const key=n==='Spam'?'desktopSpam':'desktopTellSpam',tag=n==='Spam'?'desktop-spam':'desktop-tell-spam',rows=v.Messages.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);if(rows.length>20||rows.some(x=>x.length>180)||on===true&&!rows.length&&!v['Random Only'])throw fail('Enter up to 20 messages, each at most 180 characters');const player=n==='TellSpam'?(v.Player?require('../../model/chat/delivery/chat-output').name(v.Player):''):'';if(n==='TellSpam'&&on===true&&!player)throw fail('Enter a player MCID');if(on===false&&w?.bot.chatQueue)w.bot.chatQueue.pending=w.bot.chatQueue.pending.filter(x=>x.tag!==tag);s[key]={enabled:on===null?!!s[key]?.enabled:on,player,messages:rows,interval:v.Interval,random:v['Random Text'],randomLength:Math.round(v['Random Length']),randomOnly:v['Random Only'],randomInterval:v['Random Interval'],maxInterval:Math.max(v.Interval,v['Max Interval']),cycle:v.Interval,groupIndex:0,groupDelay:0,startedAt:Date.now()};if(w?.runtime)w.runtime[key+'Next']=on===false?Date.now()+v.Interval*1000:0;lines.push(n+' updated');}
 if(n==='ChatQueue'){s.desktopChatQueue={interval:v['Send Interval'],maximum:Math.round(v.Maximum)};if(w?.bot){w.bot.desktopChatQueue=s.desktopChatQueue;if(w.bot.chatQueue)w.bot.chatQueue.pump();}lines.push('ChatQueue updated');}

 if(n==='Offhand'){const cfg=s.runtime??={};Object.assign(cfg,{offhandPacket:v.Packet,offhandSpam:v.Spam,offhandInterval:v.Interval});}
 if(n==='AntiCrystal'&&on===false){
  (s.runtime??={}).anticrystal=false;
  if(w?.runtime){w.runtime.config.anticrystal=false;w.runtime.prioritize('anticrystal',false);}
  lines.push('AntiCrystal=false');
 }else if(n==='AntiCrystal'&&on===true&&m.realm?.(id)==='ign'){
  (s.runtime??={}).anticrystal=false;
  if(w?.runtime){w.runtime.config.anticrystal=false;w.runtime.prioritize('anticrystal',false);}
  lines.push('IGN: AntiCrystal OFF');
 }else if(c.cmd&&on!==null&&!['Speed','Timer','NoSlow','AutoKit','AutoWorld'].includes(n)){let text=c.cmd+' '+(on?'on':'off');if(n==='AntiCrystal'&&on)text='anticrystal '+v.Depth;if(n==='Velocity')text+=' '+v.Horizontal+' '+v.Vertical;if(n==='ChatLog')text='gamelogs all '+(on?'on':'off');lines.push(await cmd(id,text));}
 if(n==='Speed')lines.push(await cmd(id,'speed '+(on===false?'off':on===null&&!((s.runtime?.chaseSpeed??.27)>0)?'off':v.Speed)));
 if(n==='Timer')lines.push(await cmd(id,'timer '+(on===false?'off':on===null&&!((s.runtime?.straightTimer??.24)>0)?'off':v.Multiplier)));
 if(n==='NoSlow'){const active=on===null?(s.runtime?.noSlow??true):on;lines.push(await cmd(id,'eatspeed '+v['Eat Speed']));lines.push(await cmd(id,'noslow '+(active?'on':'off')));}
 if(n==='EatStop'){const cfg=s.runtime??=Object.assign({},require('../../src/app/runtime').defaults);cfg.eatStop=on===null?(cfg.eatStop!==false):on;if(w?.runtime)w.runtime.config.eatStop=cfg.eatStop;lines.push('EatStop '+(cfg.eatStop?'ON':'OFF'));}
 if(n==='LavaWalk')lines.push(await cmd(id,'lavaspeed '+v['Lava Speed']));
 if(n==='AutoKit'||n==='AutoWorld'){const flag=n==='AutoKit'?'autoKit':'autoWorld';if(on!==null||s.ignActions?.[flag])lines.push(await cmd(id,(n==='AutoKit'?'autokit ':'autoworld ')+(on===false?'off':'on '+v[n==='AutoKit'?'Kit':'World'])));}
 if(n==='ElytraFly'){lines.push(await cmd(id,'flyspeed '+v.Horizontal+' '+v.Vertical));if(on!==null)lines.push(await cmd(id,on?'elytrafly '+v.Dimension+' '+['X','Y','Z'].map(coord).join(' '):'elytrafly off'));}
 if(n==='AutoEat')lines.push(await cmd(id,'heal '+(on===null?((s.runtime?.heal??true)?'on':'off'):on?'on':'off')+' '+v.Health/2));
 if(n==='AutoLog'){lines.push(await cmd(id,'autolog '+(on===null?((s.runtime?.autolog??true)?'on':'off'):on?'on':'off')+' '+v.Health/2));lines.push(await cmd(id,'autolog mode '+v.Condition));lines.push(await cmd(id,'autolog absorption '+(v.Absorption?'on':'off')));}
 if(n==='Follow'){lines.push(await cmd(id,'follow distance '+v.Distance));lines.push(await cmd(id,'follow mode '+v.Mode));if(on!==null||s.follow?.enabled)lines.push(await cmd(id,on===false?'follow off':'follow '+v.Target));}
 if(n==='AutoWalk'&&on!==null)lines.push(await cmd(id,on?'goto walk '+v.Dimension+' '+['X','Y','Z'].map(coord).join(' '):'stop'));
 if(n==='MobAura'){s.mobAura={enabled:on===null?!!s.mobAura?.enabled:on,range:v.Range,chaseRange:v['Chase Range'],delay:v['Attack Delay'],weapon:v.Weapon,targets:v.Targets};if(on===true){s.runtimePaused=false;if(w?.runtime)w.runtime.paused=false;}lines.push('MobAura updated');}
 if(n==='Nuke')lines.push(require('../../model/world/nuke').apply(m,id,v,on));
 if(n==='AutoEmote')lines.push(await cmd(id,'autoemote '+(on===false?'off':on===null&&!s.cosmetic?.seconds?'off':v.Interval)));
 if(n==='SkinStealer'&&(on!==null||s.cosmetic?.target))lines.push(await cmd(id,'skinstealer '+(on===false?'off':v.Player)));
 if(n==='Greeter'||n==='AutoReply'){const section=n==='Greeter'?'greeting':'replies',old=require('../../model/chat/greetings/messaging').config(m,id,section,w?.bot),enabled=on===null?old.enabled:on;require('../../model/chat/greetings/messaging').configure(m,[id],section,n==='Greeter'?{enabled,targets:v.Players,join:v.Join,leave:v.Leave,chat:v.Chat,delivery:v.Delivery}:{enabled,targets:v.Players,messages:v.Messages});lines.push('Chat settings saved');}
 if(n==='CustomCommand'){if(on===true){require('../../model/server/actions/fleet-teleport').send(m.worker(id).bot,v.Command);lines.push('Command queued');}}
 (s.desktopSettings??={})[n]=v;results.push({id,ok:true,result:lines.join(' / ')||'Settings saved'});m.changed?.(id,'desktop');
 }catch(e){results.push({id,ok:false,result:e.message});}}
 m.store.save();return {ok:results.every(r=>r.ok),results,result:results.map(r=>'Bot'+r.id+': '+r.result).join('\n')};
}
module.exports={catalog,validate,snapshot,apply};
