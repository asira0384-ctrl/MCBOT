'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Module=require('node:module');
const {transform}=require('../src/quality-fixes');
const spam=require('../desktop/bridge/desktop-spam');

test('Connect is a single ordered server-switch and connect action',()=>{
 const source="case 'endpoint':{if(!['ign','2b2e'].includes(d.realm))";
 const patched=transform('desktop/bridge/desktop-extra.js',source);
 assert.match(patched,/case 'connect-route'/);
 assert(patched.indexOf("state.serverRealm=d.realm")<patched.indexOf('m.requestConnection(id)'));
 assert.match(patched,/m\.store\.save\(\)/);
});
test('All spam schedules operate independently of manual ChatQueue settings',()=>{
 const source="const spamFields=[T('Messages'),R('Interval',5,5,120,.5),"+
  "cycle:Math.max(v.Interval,Math.ceil(ids.length/Math.round(v['Batch Size']))*v['Group Delay']),groupIndex:Math.floor(ids.indexOf(id)/Math.round(v['Batch Size']))"+
  "if(w?.runtime)w.runtime[key+'Next']=on===true?0:Date.now()+v.Interval*1000;lines.push(n+' updated');";
 const patched=transform('desktop/bridge/desktop-modules.js',source);
 assert.match(patched,/R\('Interval',5,1,120/);
 assert.match(patched,/cycle:v.Interval/);
});
function mockSpamRuntime(withTell=false){
 const outbound=[];
 const bot={connected:true,dead:false,ended:false,loggingOut:false,
  nextWhisperAt:Infinity,chatQueue:{nextAt:Infinity},
  username:'Asira',client:{queue:(name,packet)=>outbound.push({name,packet}),_tick(){}}};
 const state={desktopSpam:{enabled:!withTell,messages:['hello'],interval:1,cycle:1,random:false},
  desktopTellSpam:{enabled:withTell,messages:['hi'],interval:1,cycle:1,player:'Friend',random:false}};
 return {outbound,bot,runtime:{bot,worker:{state,id:1},manager:{store:{save(){}}}}};
}
test('Spam sends public messages despite pending manual chatQueue',()=>{
 const old=Module._load;
 Module._load=function(name,...args){
  if(name==='../../model/chat/delivery/chat-output')return {publicPacket:(_b,text)=>({message:text}),whisperPacket:(_b,to,text)=>({origin:{request_id:'test'},to,text})};
  if(name==='../../model/chat/delivery/chat-delivery')return {sent(){}};
  if(name==='../../model/chat/delivery/chat-suffix')return {apply:(_s,text)=>text};
  return old.call(this,name,...args);
 };
 try{
  const {bot,runtime,outbound}=mockSpamRuntime();
  spam.tick(runtime,10000);
  assert.deepEqual(outbound.map(x=>x.name),['text']);
  bot.chatQueue.lastWarningAt=10000;bot.chatQueue.nextAt=12000;
  spam.tick(runtime,11000);
  assert.equal(outbound.length,1);
  spam.tick(runtime,12000);
  assert.equal(outbound.length,2);
 }finally{Module._load=old;}
});
test('TellSpam has its own interval without the manual five-second timer',()=>{
 const old=Module._load;
 Module._load=function(name,...args){
  if(name==='../../model/chat/delivery/chat-output')return {publicPacket:(_b,text)=>({message:text}),whisperPacket:(_b,to,text)=>({origin:{request_id:'test'},to,text})};
  if(name==='../../model/chat/delivery/chat-delivery')return {sent(){}};
  if(name==='../../model/chat/delivery/chat-suffix')return {apply:(_s,text)=>text};
  return old.call(this,name,...args);
 };
 try{
  const {runtime,outbound}=mockSpamRuntime(true);
  spam.tick(runtime,10000);spam.tick(runtime,11000);
  assert.deepEqual(outbound.map(x=>x.name),['command_request','command_request']);
 }finally{Module._load=old;}
});
test('Native patch installs copy, route-switch and responsive arrangement',()=>{
 const {nativeTransform}=require('../src/quality-fixes');
 const source=[
  'if(m=="Activity"){for(auto&b:bots()){',
  'if(m=="Activity"){h+=bots().size()*122;',
  'if(m=="MicrosoftLogin"){if(target=="all"||target=="ign"||target=="2b2e")throw std::runtime_error("Select one bot");enqueue("/api/desktop/auth",{{"target",target}},"auth");if(!isOpen("Activity"))toggleOpen("Activity");return;}',
  'if(m=="Disconnect"||m=="Stop"||m=="BackNow"||m=="Connect"){enqueue("/api/desktop/command",{{"target",target},{"command",m=="Disconnect"?"disconnect":m=="Stop"?"stop":m=="BackNow"?"back":"connect"}});return;}',
  'values[it.key()]=it.value();break;}}}',
  'void panelBackground(Graphics&g,const Panel&p){',
  'float maxh=std::max(80.f,(float)ch/(float)guiScale-p.y-12);',
  'case WM_SIZE:cw=LOWORD(lp);ch=HIWORD(lp);InvalidateRect(w,0,FALSE);return 0;',
  'if(ready){std::lock_guard<std::recursive_mutex>l(dataMutex);loadValues();buildPanels();}InvalidateRect(w,0,FALSE);return 0;',
  'std::lock_guard<std::recursive_mutex>l(dataMutex);for(auto&[m,h]:huds)if(localOn[m]&&x>=h.x',
  'it->scroll=std::max(0.f,it->scroll+d);break;}return 0;}',
  'else invoke(h);break;}InvalidateRect(w,0,FALSE);return 0;}',
  'toggleOpen("AccountEdit");}break;}InvalidateRect(w,0,FALSE);return 0;}'
 ].join('\n');
 const patched=nativeTransform(source);
 assert.match(patched,/Copy Code/);
 assert.match(patched,/"connect-route"/);
 assert.match(patched,/void responsivePanels\(bool reset=false\)/);
 assert.match(patched,/desktopScroll=std::clamp/);
 assert.equal(nativeTransform(patched),patched);
});
