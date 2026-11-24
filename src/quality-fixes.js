'use strict';
// Asira MCBOT 2026-11-21. Actual JS source patches are applied before require().
// The native source is patched by: node src/quality-fixes.js --native
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const previous = require('./hotfix');
const root = path.resolve(__dirname, '..');
const replacements = {
  'src/app/manager.js': [
    [
      "if(this.workers.has(id))return '接続済み・認証中です。statusで現在の段階を確認できます';",
      "const existing=this.workers.get(id);if(existing&&(existing.bot?.ended||existing.mode==='disconnected')){existing.destroy?.();this.workers.delete(id);}else if(existing)return '接続済み・認証中です。statusで現在の段階を確認できます';"
    ],
    [
      "this.trace(id,`接続先: ${bot.config.host}:${bot.config.port} / 通信版: ${bot.config.version||'広告から自動選択'}`);",
      "this.trace(id,`接続先: ${bot.config.host}:${bot.config.port} / 通信版: ${bot.config.version||'広告から自動選択'} / Server: ${realm}`);"
    ]
  ],
  'desktop/bridge/desktop-extra.js': [
    [
      "case 'endpoint':{if(!['ign','2b2e'].includes(d.realm))",
      `case 'connect-route': {
 // One atomic desktop action: apply requested server FIRST, THEN start login/connect.
 // A saved Microsoft token is not a guarantee of Minecraft authorization.
 if(!['ign','2b2e'].includes(d.realm))throw fail('Server must be ign or 2b2e');
 const destination=d.custom?endpoint(d):null,chosen=ids(),results=[];
 for(const id of chosen){
  const state=m.store.bot(id),old=state.customEndpoint;
  const changed=state.serverRealm!==d.realm||!!old!==!!destination||
   !!destination&&(old?.host!==destination.host||Number(old?.port)!==destination.port);
  try{
   if(changed){await m.execute(String(id),'disconnect','web');state.serverRealm=d.realm;
    if(destination)state.customEndpoint=destination;else delete state.customEndpoint;
    m.store.save();m.changed?.(id,'server');}
   const status=m.requestConnection(id);results.push({id,ok:true,
    result:'Connecting '+d.realm.toUpperCase()+' / '+(status?.connection?.phase||'auth pending')});
  }catch(error){results.push({id,ok:false,result:error.message});}
 }
 return {ok:results.every(row=>row.ok),results,
  result:results.map(row=>'Bot'+row.id+': '+row.result).join('\\n')};
}
case 'endpoint':{if(!['ign','2b2e'].includes(d.realm))`
    ]
  ],
  'desktop/bridge/desktop-modules.js': [
    [
      "const spamFields=[T('Messages'),R('Interval',5,5,120,.5),",
      "const spamFields=[T('Messages'),R('Interval',5,1,120,.5),"
    ],
    [
      "cycle:Math.max(v.Interval,Math.ceil(ids.length/Math.round(v['Batch Size']))*v['Group Delay']),groupIndex:Math.floor(ids.indexOf(id)/Math.round(v['Batch Size']))",
      "cycle:v.Interval,groupIndex:Math.floor(ids.indexOf(id)/Math.round(v['Batch Size']))"
    ],
    [
      "if(w?.runtime)w.runtime[key+'Next']=on===true?0:Date.now()+v.Interval*1000;lines.push(n+' updated');",
      "if(w?.runtime&&on!==null)w.runtime[key+'Next']=on===true?0:Infinity;lines.push(n+' updated');"
    ]
  ],
  'web/server/panel.js': [
    [
      "s.result=await this.manager.execute(s.target,cmd);}\n   await i.editReply(this.render(s));",
      `if(cmd==='connect'){
     const results=[];for(const id of this.ids(s)){
      try{this.manager.requestConnection(id);results.push('Bot'+id+': 認証・接続開始');}
      catch(e){results.push('Bot'+id+': '+e.message);}
     }s.result=results.join('\\n').slice(0,500);
    }else s.result=await this.manager.execute(s.target,cmd);}
   await i.editReply(this.render(s));`
    ]
  ]
};
function once(source, oldText, newText, filename) {
 if(source.includes(newText))return source;
 const first=source.indexOf(oldText);
 if(first<0)throw Error(filename+' source changed. Missing: '+oldText.slice(0,110));
 if(source.indexOf(oldText,first+1)>=0)throw Error(filename+' ambiguous patch: '+oldText.slice(0,70));
 return source.slice(0,first)+newText+source.slice(first+oldText.length);
}
function transform(file,source) {
 let result=source;
 for(const [before,after] of replacements[file]||[])result=once(result,before,after,file);
 return result;
}
const ownFiles=new Set([...Object.keys(replacements)]);
const baseFixed=new Set(['web/server/panel.js','discord/bot/discord.js','web/server/web.js','src/app/manager.js','src/auth/accounts.js']);
let installed=false;
function install(){
 if(installed)return;installed=true;
 const inherited=Module._extensions['.js'];
 Module._extensions['.js']=function(mod,filename){
  const rel=path.relative(root,filename).split(path.sep).join('/');
  if(!ownFiles.has(rel))return inherited(mod,filename);
  let content=fs.readFileSync(filename,'utf8');
  // Reapply the pre-existing 50-account/401 fixes as well, rather than skipping
  // the original require hook for the files changed by this update.
  if(baseFixed.has(rel))content=previous.transform(rel,content);
  mod._compile(transform(rel,content),filename);
 };
 console.log('[ASIRA FIX 2026-11-21] 50 bots / route-first connect / spam queue separation / stale connection reset');
}
function nativeTransform(source){
 let output=source;const change=(oldText,newText)=>{output=once(output,oldText,newText,'desktop-native/main.cpp');};
 // Show code + COPY directly under MicrosoftLogin, not only under Activity.
 change('if(m=="Activity"){for(auto&b:bots()){',`if(m=="MicrosoftLogin"){
 bool found=false;
 for(auto&b:bots()){
  const J a=b.value("authentication",J::object());
  txt(g,"BOT"+std::to_string(b.value("id",0))+" / "+str(b,"name"),x,y,w,18,theme("Text"),11);y+=19;
  const J c=a.value("code",J::object());const std::string code=str(c,"value");
  if(!code.empty()){
   txt(g,code,x,y,w,26,theme("Accent"),15);y+=28;
   inlineButton(g,"Copy Code",x,y,w*.49f,"copycode","","",code);
   inlineButton(g,"Microsoft link",x+w*.51f,y,w*.49f,"mslink");y+=28;found=true;
  }else{
   const J conn=a.value("connection",J::object());
   const std::string status=str(a,"state","required")+" / "+str(conn,"phase","not connected");
   txt(g,status,x,y,w,42,theme("Off Text"),10);y+=43;
  }
  const J conn=a.value("connection",J::object());
  txt(g,a.value("saved",false)?"Account token saved (not necessarily joined)":"No saved account token",x,y,w,19,theme("Off Text"),10);y+=21;
  const std::string err=str(conn,"error",str(a,"error"));
  if(!err.empty()){txt(g,err,x,y,w,55,Color(255,245,158,153),10);y+=58;}
 }
 if(!found){txt(g,"Choose one bot and click MicrosoftLogin",x,y,w,37,theme("Off Text"),10);y+=37;}
 btn("Fresh login / reset cached token","refreshauth");
}
if(m=="Activity"){for(auto&b:bots()){`);
 change('if(m=="Activity"){h+=bots().size()*122;',
        'if(m=="MicrosoftLogin")h+=bots().size()*180+38;if(m=="Activity"){h+=bots().size()*122;');
 change('if(m=="MicrosoftLogin"){if(target=="all"||target=="ign"||target=="2b2e")throw std::runtime_error("Select one bot");enqueue("/api/desktop/auth",{{"target",target}},"auth");if(!isOpen("Activity"))toggleOpen("Activity");return;}',
        'if(m=="MicrosoftLogin"){if(target=="all"||target=="ign"||target=="2b2e")throw std::runtime_error("Select one bot");enqueue("/api/desktop/auth",{{"target",target}},"auth");if(!isOpen("MicrosoftLogin"))toggleOpen("MicrosoftLogin");return;}');
 // The Connect button must apply the selected server before it starts joining.
 change('if(m=="Disconnect"||m=="Stop"||m=="BackNow"||m=="Connect"){enqueue("/api/desktop/command",{{"target",target},{"command",m=="Disconnect"?"disconnect":m=="Stop"?"stop":m=="BackNow"?"back":"connect"}});return;}',
 `if(m=="Connect"){
   if(target=="all"||target=="ign"||target=="2b2e"){
    enqueue("/api/desktop/command",{{"target",target},{"command","connect"}});
   }else{
    const std::string realm=sv("Connect","Server","2b2e");
    enqueue("/api/desktop/control",{{"action","connect-route"},{"target",target},{"realm",realm},
      {"custom",bv("Connect","Custom IP")},{"host",sv("Connect","IP")},{"port",(int)nv("Connect","Port",19132)}},"account");
    toast("Connecting to "+realm+" / check MicrosoftLogin status");
   }return;
  }
 if(m=="Disconnect"||m=="Stop"||m=="BackNow"){
  enqueue("/api/desktop/command",{{"target",target},{"command",m=="Disconnect"?"disconnect":m=="Stop"?"stop":"back"}});return;
 }`);
 // Selected account's saved realm is the Connect module's default setting.
 change('values[it.key()]=it.value();break;}}}',
        'values[it.key()]=it.value();break;}}for(auto&b:state.value("bots",J::array()))if(std::to_string(b.value("id",0))==target){values["Connect"]["Server"]=b.value("server",std::string("2b2e"));break;}}');
 // Responsive window resize: grid/skyline layout that does not overlap categories.
 change('void panelBackground(Graphics&g,const Panel&p){',`float desktopScroll=0,desktopMaxScroll=0;
void responsivePanels(bool reset=false){
 if(panels.empty())return;
 if(reset)desktopScroll=0;
 const float screenW=std::max(260.f,cw/(float)guiScale),screenH=std::max(300.f,ch/(float)guiScale);
 int columns=std::clamp((int)((screenW-24)/163),1,10);
 std::vector<float> ends(columns,64.f);
 auto approximate=[&](Panel&p){
  float r=nv("ClickGUI","Row Height",26),desired=34;
  if(p.title=="Account"){
   desired+=(3+state.value("bots",J::array()).size())*r;
   if(isOpen("AccountAdd"))desired+=settingsHeight("AccountAdd",p.w-16);
   if(isOpen("AccountEdit"))desired+=settingsHeight("AccountEdit",p.w-16);
  }else for(auto&mod:p.mods){desired+=r;if(isOpen(mod))desired+=settingsHeight(mod,p.w-16);}
  return std::clamp(desired,80.f,std::max(90.f,screenH-78));
 };
 for(auto&p:panels){
  if(p.hud)continue;
  int col=0;
  if(p.title=="Account")col=0;
  else{
   const int start=columns>1?1:0;
   col=start;for(int n=start+1;n<columns;n++)if(ends[n]<ends[col])col=n;
  }
  p.x=12+col*163;p.y=ends[col]-desktopScroll;
  ends[col]+=approximate(p)+9;
 }
 desktopMaxScroll=std::max(0.f,*std::max_element(ends.begin(),ends.end())-screenH+12);
 desktopScroll=std::clamp(desktopScroll,0.f,desktopMaxScroll);
}
void panelBackground(Graphics&g,const Panel&p){`);
 change('float maxh=std::max(80.f,(float)ch/(float)guiScale-p.y-12);',
        'float maxh=std::max(80.f,(float)ch/(float)guiScale-78.f);');
 change('case WM_SIZE:cw=LOWORD(lp);ch=HIWORD(lp);InvalidateRect(w,0,FALSE);return 0;',
        'case WM_SIZE:cw=LOWORD(lp);ch=HIWORD(lp);responsivePanels(true);InvalidateRect(w,0,FALSE);return 0;');
 change('if(ready){std::lock_guard<std::recursive_mutex>l(dataMutex);loadValues();buildPanels();}InvalidateRect(w,0,FALSE);return 0;',
        'if(ready){std::lock_guard<std::recursive_mutex>l(dataMutex);loadValues();buildPanels();responsivePanels(true);}InvalidateRect(w,0,FALSE);return 0;');
 change('std::lock_guard<std::recursive_mutex>l(dataMutex);for(auto&[m,h]:huds)if(localOn[m]&&x>=h.x',
        'std::lock_guard<std::recursive_mutex>l(dataMutex);if(GetKeyState(VK_SHIFT)&0x8000){desktopScroll=std::clamp(desktopScroll+d,0.f,desktopMaxScroll);responsivePanels();InvalidateRect(w,0,FALSE);return 0;}for(auto&[m,h]:huds)if(localOn[m]&&x>=h.x');
 change('it->scroll=std::max(0.f,it->scroll+d);break;}return 0;}',
        'it->scroll=std::max(0.f,it->scroll+d);return 0;}desktopScroll=std::clamp(desktopScroll+d,0.f,desktopMaxScroll);responsivePanels();InvalidateRect(w,0,FALSE);return 0;}');
 // Preserve drag, but layout settings changes right away when a panel expands.
 change('else invoke(h);break;}InvalidateRect(w,0,FALSE);return 0;}',
        'else {invoke(h);if(h.type=="module")responsivePanels();}break;}InvalidateRect(w,0,FALSE);return 0;}');
 change('toggleOpen("AccountEdit");}break;}InvalidateRect(w,0,FALSE);return 0;}',
        'toggleOpen("AccountEdit");}responsivePanels();break;}InvalidateRect(w,0,FALSE);return 0;}');
 // Keep the original native GUI while modernizing its login screen and endpoint.
 change('std::string target="all",csrf,sessionCookie,base="https://mcbot-production-b2fb.up.railway.app",flowId,flowSecret;',
        'std::string target="all",csrf,sessionCookie,base="https://mcbot-asira.up.railway.app",flowId,flowSecret;');
 // Older Last.json files silently override the executable default: migrate only the obsolete domain.
 change('base=prefs.value("server",base);',
        'base=prefs.value("server",base);if(base.find("mcbot-production-b2fb.up.railway.app")!=std::string::npos)base="https://mcbot-asira.up.railway.app";if(base.rfind("ttps://",0)==0)base="h"+base;');
 // Reject bad URLs *before* doing a network request and give a meaningful explanation.
 change('while(base.size()&&base.back()==\'/\')base.pop_back();}if(base.find(\'?\')',
        'while(base.size()&&base.back()==\'/\')base.pop_back();if(base.rfind("ttps://",0)==0)base="h"+base;if(base.rfind("https://",0)!=0&&base.rfind("http://localhost",0)!=0&&base.rfind("http://127.0.0.1",0)!=0)throw std::runtime_error("Server must start with https:// (example: https://mcbot-asira.up.railway.app)");values["Login"]["Server"]=base;}if(base.find(\'?\')');
 // Preserve the actual HTTP response code and message so expired login codes,
 // an out-of-date WEB_BASE_URL, and Railway reverse proxy failures can be diagnosed.
 // The old code replaced every non-standard error object with the useless "Server error".
 change('if(status>=400){try{throw std::runtime_error(J::parse(text).value("error","Server error"));}catch(const J::exception&){throw std::runtime_error("HTTP "+std::to_string(status));}}return text;',
 `if(status>=400){
  std::string reason;
  try{J obj=J::parse(text);
   if(obj.is_object()){
    if(obj.contains("error")&&obj["error"].is_string())reason=obj["error"].get<std::string>();
    if(reason.empty()&&obj.contains("message")&&obj["message"].is_string())reason=obj["message"].get<std::string>();
   }
  }catch(...){}
  if(reason.empty()){if(text.empty())reason="Empty server response";
    else if(text[0]=='<')reason="Railway returned HTML instead of the MCBOT API. Check the public domain port.";
    else reason=text.substr(0,260);}
  std::replace(reason.begin(),reason.end(),'\\n',' ');
  throw std::runtime_error("HTTP "+std::to_string(status)+": "+reason.substr(0,260));
 }return text;`);
 // The old form repaints every 25ms over a focused native EDIT control, causing blinking.
 // Preserve module timers but do not repaint the form during text editing.
 // The old and partially-patched versions differ around WM_APP+1.
 // Apply both changes independently so GitHub Actions also builds when the
 // previous flicker fix was already committed.
 if(output.includes('it=dirty.erase(it);}else++it;InvalidateRect(w,0,FALSE);return 0;}'))
  change('it=dirty.erase(it);}else++it;InvalidateRect(w,0,FALSE);return 0;}',
         'it=dirty.erase(it);}else++it;if(!editWnd)InvalidateRect(w,0,FALSE);return 0;}');
 if(output.includes('case WM_APP+1:commitEdit();if(ready)'))
  change('case WM_APP+1:commitEdit();if(ready)', 'case WM_APP+1:if(ready)');
 // The async state update must never force-save and remove a focused input control.
 change('if(ready){std::lock_guard<std::recursive_mutex>l(dataMutex);loadValues();buildPanels();responsivePanels(true);}InvalidateRect(w,0,FALSE);return 0;',
        'if(ready){std::lock_guard<std::recursive_mutex>l(dataMutex);loadValues();if(!editWnd){buildPanels();responsivePanels(true);}}if(!editWnd)InvalidateRect(w,0,FALSE);return 0;');
 // Keep the original functional ClickGUI and refresh only the login card styling.
 change('box(g,x-18,y-18,456,390,theme("Panel",242),8);txt(g,"Asira Native",x,y,420,40,theme("Text"),25);',
        'box(g,x-18,y-18,456,390,Color(250,31,25,44),10);Pen loginBorder(Color(170,129,99,163),1);g.DrawRectangle(&loginBorder,x-18,y-18,456,390);txt(g,"Asira Native",x,y,420,40,theme("Text"),25);');

 // Final login UI and focused-input repaint fixes; applied after the base native patches.
 for(const [oldText,newText] of [["else{float x=W*.5-210,y=H*.5-190;box(g,x-18,y-18,456,390,Color(250,31,25,44),10);Pen loginBorder(Color(170,129,99,163),1);g.DrawRectangle(&loginBorder,x-18,y-18,456,390);txt(g,\"Asira Native\",x,y,420,40,theme(\"Text\"),25);y+=52;","else{float x=W*.5-210,y=std::max(44.f,H*.5f-238.f);box(g,x-18,y-18,456,484,Color(250,31,25,44),10);Pen loginBorder(Color(170,129,99,163),1);g.DrawRectangle(&loginBorder,x-18,y-18,456,484);txt(g,\"Asira Native\",x,y,420,40,theme(\"Text\"),25);txt(g,\"Connect with your Railway bot and Discord account.\",x,y+44,420,24,theme(\"Off Text\"),11);y+=83;"],["for(auto&d:localDefs[\"Login\"])y=drawField(g,\"Login\",d,x,y,420);inlineButton(g,\"Discord login → browser\",x,y+8,205,\"discord\");inlineButton(g,\"Sign in with code\",x+216,y+8,204,\"code\");txt(g,\"Discord /desktop action:login also provides a code.\",x,y+46,420,40,theme(\"Off Text\"),11);","y=drawField(g,\"Login\",localDefs[\"Login\"][0],x,y,420);y+=12;txt(g,\"Discord Authentication\",x,y,420,21,theme(\"Accent\"),12);y+=23;inlineButton(g,\"Sign in with Discord - browser\",x,y,420,\"discord\");y+=40;txt(g,\"Or use the code from Discord /desktop\",x,y,420,21,theme(\"Accent\"),12);y+=22;y=drawField(g,\"Login\",localDefs[\"Login\"][1],x,y,420);inlineButton(g,\"Sign in with code\",x,y+4,420,\"code\");txt(g,\"One-time codes expire. Request a new code if sign-in fails.\",x,y+38,420,36,theme(\"Off Text\"),10);"],["case WM_APP+2:InvalidateRect(w,0,FALSE);return 0;","case WM_APP+2:if(!editWnd)InvalidateRect(w,0,FALSE);return 0;"],["SendMessage(editWnd,EM_SETSEL,0,-1);}","if(h.m==\"Login\"&&h.k==\"Server\")SendMessage(editWnd,EM_SETSEL,0,0);else SendMessage(editWnd,EM_SETSEL,0,-1);}"]])change(oldText,newText);
 return output;
}
function applyNative(){
 const filename=path.join(root,'desktop-native','main.cpp');
 let content=fs.readFileSync(filename,'utf8');
 // Pre-existing package's native copy-code/cookie fix MUST be applied first.
 content=previous.transform('desktop-native/main.cpp',content);
 const updated=nativeTransform(content);
 if(updated!==fs.readFileSync(filename,'utf8')){
  const backup=filename+'.before-20261121.bak';
  if(!fs.existsSync(backup))fs.copyFileSync(filename,backup);
  fs.writeFileSync(filename,updated);
 }
 console.log('[ASIRA FIX 2026-11-21] Native source updated: copy code, server connect, responsive layout.');
}
if(require.main===module){
 try{
  if(process.argv.includes('--native'))applyNative();
  else if(process.argv.includes('--verify')){
   if(!fs.existsSync(path.join(root,'src','hotfix.js')))throw Error('Base hotfix missing');
   console.log('Quality patch registered for:',[...ownFiles].join(', '));
   console.log('Windows compile: cd desktop-native && build.cmd');
  }else throw Error('Usage: node src/quality-fixes.js --verify | --native');
 }catch(e){console.error(e.stack);process.exitCode=1;}
}
module.exports={install,transform,nativeTransform,applyNative};
