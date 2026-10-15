'use strict';
(()=>{
 const $=id=>document.getElementById(id),el=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;};
 const app={state:null,target:'all',csrf:'',owner:'Asira',stream:null,tab:'overview',selectedSlot:null,pausedLog:false,busy:new Set(),lastForms:'',enemiesKey:'',toastTimer:null,poll:null,viewURL:null};
 try{app.target=localStorage.getItem('asira-target')||'all';}catch{}
 const moduleRows=new Map(),botRows=new Map(),tableRows=new Map(),inventoryRows=[];
 const survivals=[['gear','Armor','防具を自動で装備','◇'],['autototem','AutoTotem','Totemを補充・なければ盾を装備','✦'],['autoslot','AutoSlot','拾ったアイテムをホットバーへ','▦'],['heal','AutoEat','設定した体力以下で金リンゴを食べる','♡'],['respawn','AutoRespawn','死亡を確認してリスポーン','↻'],['supply','AutoSupply','近くのシュルカーから必要なものを補給','▣']];
 const combats=[['killaura','KillAura','登録した敵を剣で攻撃・追尾','⌁'],['crystalaura','CrystalAura','設置面を選んでCrystalを設置・起爆','✧'],['pistoncrystal','PistonCrystal','ホール内・しゃがんでいない敵だけ','▥'],['anticrystal','AntiCrystal','設定した深さへ埋まる動作','▱'],['autolog','AutoLog','危険な体力になったら切断','↪'],['jetpack','Jetpack','自分のCrystalの爆風後、最大1秒追尾','↗']];
 const itemNames={netherite_sword:'ネザライトの剣',diamond_sword:'ダイヤの剣',netherite_pickaxe:'ネザライトのツルハシ',diamond_pickaxe:'ダイヤのツルハシ',enchanted_golden_apple:'エンチャント金リンゴ',golden_apple:'金リンゴ',totem_of_undying:'Totem',shield:'盾',elytra:'エリトラ',potion:'ポーション',glass_bottle:'空き瓶',end_crystal:'Crystal',obsidian:'黒曜石',piston:'ピストン',sticky_piston:'粘着ピストン',redstone_block:'レッドストーンブロック'};
 const itemName=name=>itemNames[name]||name||'なし';
 const icon=name=>/sword/.test(name)?'⚔':/pickaxe/.test(name)?'⛏':/apple/.test(name)?'✦':/totem/.test(name)?'☥':/potion|bottle/.test(name)?'⚗':/elytra/.test(name)?'⋈':/crystal/.test(name)?'◈':/shield/.test(name)?'⛨':/helmet|chestplate|leggings|boots/.test(name)?'◇':'▣';
 const fmt=n=>Number.isFinite(n)?Number(n.toFixed(1)).toString():'—',clock=n=>new Date(n).toLocaleTimeString('ja-JP',{hour12:false}),position=p=>p?`${fmt(p.x)}, ${fmt(p.y)}, ${fmt(p.z)}`:'—';
 function selected(){const bots=app.state?.bots||[];return bots.filter(b=>app.target==='all'||app.target==='2b2e'&&b.server==='2b2e'||app.target==='ign'&&b.server==='ign'||String(b.id)===app.target);}
 const title=()=>app.target==='all'?'すべてのBot':app.target==='2b2e'?'2b2e のBot':app.target==='ign'?'IGN PvP':selected()[0]?.name||'Bot';
 function toast(text,error=false){clearTimeout(app.toastTimer);$('toast').textContent=String(text).slice(0,280);$('toast').className='toast'+(error?' error':'');$('toast').hidden=false;app.toastTimer=setTimeout(()=>$('toast').hidden=true,6000);}
 function result(text,error=false){$('result-panel').hidden=false;$('result-text').textContent=String(text);toast(error?'操作結果を確認してください':String(text).split('\n')[0],error);}
 function expired(message='Discordの /web から開き直してください'){
  app.stream?.close();app.stream=null;clearInterval(app.poll);app.poll=null;app.csrf='';app.state=null;app.lastForms='';app.selectedSlot=null;$('app').hidden=true;$('login-screen').hidden=false;$('login-error').textContent=message;
 }
 async function api(url,data){
  const options={credentials:'same-origin',headers:{}};if(data!==undefined){Object.assign(options,{method:'POST',body:JSON.stringify(data)});Object.assign(options.headers,{'Content-Type':'application/json','X-CSRF-Token':app.csrf,'X-Request-Id':crypto.randomUUID()});}
  const response=await fetch(url,options),value=await response.json();
  if(response.status===401){expired(value.error);throw Error(value.error||'ログインが必要です');}
  if(!response.ok||value.ok===false)throw Error(value.error||value.result||'操作できません');return value;
 }
 async function command(value){
  const key=app.target+':'+value.split(' ')[0];if(app.busy.has(key))return;app.busy.add(key);refreshBusy();
  try{const valueResponse=await api('/api/command',{target:app.target,command:value});result(valueResponse.result);await refresh();return valueResponse;}catch(e){result(e.message,true);throw e;}finally{app.busy.delete(key);refreshBusy();}
 }
 async function executeMany(commands){for(const value of commands)await command(value);}
 function refreshBusy(){
  document.querySelectorAll('[data-command]').forEach(button=>{const name=button.dataset.command.split(' ')[0],key=app.target+':'+name;button.classList.toggle('pending',app.busy.has(key));button.disabled=app.busy.has(key);});
  for(const [key,{button}]of moduleRows)button.disabled=app.busy.has(app.target+':'+key);
 }
 function configValue(bot,key){return key==='respawn'?bot.options.respawn:key==='supply'?bot.options.autoSupply:bot.config[key];}
 function buildModules(list,target){for(const [key,name,description,symbol]of list){
  const row=el('div','toggle-row'),symbolNode=el('span','module-icon',symbol),text=el('div','module-text');text.append(el('strong','',name),el('small','',description));
  const button=el('button','toggle');button.type='button';button.setAttribute('role','checkbox');button.setAttribute('aria-label',name);button.dataset.module=key;
  button.addEventListener('click',()=>{const bots=selected(),on=!bots.length||!bots.every(b=>configValue(b,key));command(`${key} ${on?'on':'off'}`).catch(()=>{});});
  row.append(symbolNode,text,button);$(target).append(row);moduleRows.set(key,{button,row});
 }}
 buildModules(survivals,'survival-toggles');buildModules(combats,'combat-toggles');
 function choose(target){app.target=String(target);app.selectedSlot=null;app.lastForms='';try{localStorage.setItem('asira-target',app.target);}catch{}if(app.state)render();}
 function switchTab(name){app.tab=name;document.querySelectorAll('.tab').forEach(n=>n.classList.toggle('active',n.dataset.tab===name));document.querySelectorAll('.tab-content').forEach(n=>n.hidden=n.id!=='tab-'+name);if(name==='logs')renderLogs();}
 function stateLabel(bot){if(!bot.connected)return bot.phase;return bot.dead?'死亡・リスポーン待ち':bot.runtime?.operation||bot.runtime?.movement||({'running':'整地中','stopped':'待機中','healing':'回復中'}[bot.mode]||bot.mode);}
 function renderBotList(){
  const bots=app.state.bots,ids=new Set(bots.map(b=>b.id));for(const [id,node]of botRows)if(!ids.has(id)){node.remove();botRows.delete(id);}
  for(const b of bots){let button=botRows.get(b.id);if(!button){button=el('button','bot-button');button.type='button';button.append(el('span','bot-avatar',String(b.id).padStart(2,'0')),el('span','bot-name'),el('span','status-dot'));button.addEventListener('click',()=>choose(b.id));$('bot-list').append(button);botRows.set(b.id,button);}button.classList.toggle('active',app.target===String(b.id));button.children[1].textContent=b.name;button.children[2].className='status-dot'+(b.connected?b.dead?' danger':' online':'');button.title=b.name+' / '+stateLabel(b);}
  const mobile=$('mobile-target');for(const b of bots)if(!mobile.querySelector(`option[value="${b.id}"]`)){const option=el('option','',`Bot${b.id} / ${b.name}`);option.value=String(b.id);mobile.append(option);}mobile.value=app.target;
  document.querySelectorAll('.fleet-group').forEach(n=>n.classList.toggle('active',n.dataset.target===app.target));
  $('fleet-count').textContent=bots.length;$('2b2e-count').textContent=bots.filter(b=>b.server==='2b2e').length;$('ign-count').textContent=bots.filter(b=>b.server==='ign').length;$('online-label').textContent=bots.filter(b=>b.connected).length+' ONLINE';
 }
 function renderTable(bots){
  const ids=new Set(bots.map(b=>b.id));for(const [id,row]of tableRows)if(!ids.has(id)){row.remove();tableRows.delete(id);}
  for(const b of bots){let row=tableRows.get(b.id);if(!row){row=el('tr');row.tabIndex=0;for(let i=0;i<5;i++)row.append(el('td'));row.children[0].className='account-cell';row.children[2].append(el('span','status-chip'));row.children[3].className='health-cell';row.children[4].className='mono';row.addEventListener('click',()=>choose(b.id));row.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose(b.id);}});$('fleet-table').append(row);tableRows.set(b.id,row);}
   row.children[0].textContent=String(b.id).padStart(2,'0')+'  '+b.name;row.children[1].textContent=b.server==='ign'?'IGN PvP':'2b2e';row.children[2].textContent=stateLabel(b);row.children[3].textContent=b.health===null?'—':fmt(b.health/2)+' ♥';row.children[4].textContent=position(b.position);
  }$('table-count').textContent=bots.length+' BOTS';
 }
 function renderInventory(bot){
  if(!inventoryRows.length){for(let n=0;n<36;n++){const button=el('button','inventory-slot');button.type='button';button.append(el('span','slot-index',n<9?String(n+1):''),el('span','item-icon'),el('span','item-name'),el('span','item-count'));button.addEventListener('click',()=>{app.selectedSlot=n;renderInventory(selected().length===1?selected()[0]:null);});$('inventory-grid').append(button);inventoryRows.push(button);}}
  inventoryRows.forEach((button,n)=>{const item=bot?.inventory[n],name=item?.name||'';button.disabled=!bot;button.className='inventory-slot'+(!name?' empty':'')+(n<9?' hotbar':'')+(app.selectedSlot===n?' selected':'');button.children[1].textContent=name?icon(name):'';button.children[2].textContent=itemName(name);button.children[3].textContent=item?.count>1?item.count:'';button.title=`${n+1}: ${itemName(name)}${name?' ×'+item.count:''}`;button.setAttribute('aria-label',button.title);});
  $('inventory-label').textContent=bot?bot.name:'単体Botを選択';const item=bot?.inventory[app.selectedSlot];$('selected-item').textContent=item?.name?`${itemName(item.name)} ×${item.count} / スロット${app.selectedSlot+1}`:'アイテムを選択してください';$('equip-item').disabled=!bot?.connected||!item?.name;
  const armor=$('armor-strip');if(!armor.children.length)for(const label of ['ヘルメット','胴体','レギンス','ブーツ','オフハンド']){const slot=el('div','equipment-slot');slot.append(el('span','',label),el('strong',''));armor.append(slot);}const items=bot?[...bot.armor,bot.offhand]:[];[...armor.children].forEach((slot,n)=>slot.children[1].textContent=itemName(items[n]?.name));
  const r=bot?.runtime;$('consumption-status').textContent=r?.consumption?`飲食中: ${itemName(r.consumption.name)} / ${r.consumption.phase} / 試行${r.consumption.attempt||1}`:r?.lastItemUse?`最後の飲食: ${itemName(r.lastItemUse.name)} / ${r.lastItemUse.status==='confirmed'?'サーバーの消費を確認':r.lastItemUse.status==='cancelled'?'中断':r.lastItemUse.reason||'未確認'}`:'飲食の完了は、実際のアイテム消費で確認します。';
 }
 function fillForm(name,values){const form=$(name);for(const [key,value]of Object.entries(values)){const field=form.elements.namedItem(key);if(field)field.value=value??'';}}
 function syncForms(bots){const key=app.target;if(app.lastForms===key||!bots.length)return;app.lastForms=key;const b=bots[0],c=b.config;fillForm('speed-form',{horizontal:c.flyHorizontal,vertical:c.flyVertical,chase:c.chaseSpeed,timer:c.straightTimer});fillForm('health-form',{heal:c.healHearts,log:c.logHearts});fillForm('predict-form',{count:c.crystalPredict});fillForm('scaffold-form',{block:b.options.scaffold});fillForm('mining-form',{...b.options.area,floor:b.options.floor??64,ceiling:b.options.ceiling??319});}
 function renderEnemies(){const names=app.state.enemies,key=JSON.stringify(names);if(key===app.enemiesKey)return;app.enemiesKey=key;$('enemy-list').replaceChildren();if(!names.length){$('enemy-list').append(el('p','hint','敵は登録されていません。'));return;}for(const name of names){const row=el('div','enemy-item'),button=el('button','','解除');row.append(el('span','',name),button);button.addEventListener('click',()=>command('enemy remove '+name).catch(()=>{}));$('enemy-list').append(row);}}
 function renderLogs(){if(!app.state||app.pausedLog)return;const filter=$('log-filter').value.toLowerCase(),lines=selected().flatMap(b=>b.logs.map(line=>`[Bot${String(b.id).padStart(2,'0')}] ${line}`)).filter(line=>!filter||line.toLowerCase().includes(filter));const pre=$('logs'),atBottom=pre.scrollHeight-pre.scrollTop-pre.clientHeight<45,text=lines.join('\n')||'ログはまだありません。';if(pre.textContent!==text){pre.textContent=text;if(atBottom)pre.scrollTop=pre.scrollHeight;}$('log-update').textContent=clock(app.state.at);const audits=app.state.audit.slice().reverse(),parent=$('audit-log'),auditKey=JSON.stringify(audits);if(parent.dataset.key!==auditKey){parent.dataset.key=auditKey;parent.replaceChildren();if(!audits.length)parent.append(el('p','hint','操作履歴はまだありません。'));for(const entry of audits){const row=el('div','audit-row');row.append(el('time','',clock(entry.at)),el('span','',`Bot ${entry.ids.join(', ')} / ${entry.action}`));parent.append(row);}}}
 function render(){
  if(!app.state)return;let bots=selected();if(!bots.length&&app.target!=='all'){app.target='all';bots=selected();}
  if(app.lastViewTarget!==app.target){app.lastViewTarget=app.target;$('view-image').hidden=true;$('view-placeholder').hidden=false;if(app.viewURL){URL.revokeObjectURL(app.viewURL);app.viewURL=null;}}
  renderBotList();const connected=bots.filter(b=>b.connected),one=bots.length===1?bots[0]:null,health=connected.filter(b=>b.health!==null);$('target-title').firstChild.nodeValue=title();$('target-count').textContent=bots.length===1?'BOT '+String(bots[0].id).padStart(2,'0'):bots.length+' BOTS';$('breadcrumb-target').textContent=title();$('target-description').textContent=one?`${one.server==='ign'?'IGN PvP':'2b2e'} · ${one.endpoint.host}:${one.endpoint.port}`:'一か所から接続・移動・装備・戦闘を管理。';$('metric-online').textContent=connected.length;$('metric-total').textContent='/ '+bots.length;$('metric-health').textContent=health.length?fmt(health.reduce((n,b)=>n+b.health/2,0)/health.length):'—';$('metric-health-note').textContent=one?'現在のハート数':'接続中の対象の平均';$('metric-running').textContent=connected.filter(b=>b.runtime?.operation||b.runtime?.movement||b.mode==='running').length;$('target-summary').textContent=one?stateLabel(one):`${bots.length}体を選択 / ${connected.length}体がオンライン`;$('target-dot').className='status-dot'+(connected.length?' online':'');$('auth').disabled=bots.length!==1;$('refresh-view').disabled=!one?.connected;
  for(const [key,{button}]of moduleRows){const all=bots.length>0&&bots.every(b=>configValue(b,key)),some=bots.some(b=>configValue(b,key));button.className='toggle'+(all?' on':some?' mixed':'');button.setAttribute('aria-checked',all?'true':some?'mixed':'false');button.title=all?'ON':some?'Botごとに設定が異なります':'OFF';}
  ['x','y','z'].forEach(k=>$('position-'+k).textContent=one?.position?fmt(one.position[k]):'—');$('position-dimension').textContent=one?['現世','ネザー','エンド'][one.dimension]||'不明':'対象のBotを1体選んでください';$('position-note').textContent=one?.position?(one.dead?'死亡中の最終座標です。':'受信済みの現在位置です。'):'複数Botの座標は下の一覧から確認できます。';$('copy-position').disabled=!one?.position;
  const r=one?.runtime;$('runtime-summary').textContent=r?[r.operation||r.movement||stateLabel(one),r.target?'敵: '+r.target:r.combatWaiting||''].filter(Boolean).join('\n'):one?stateLabel(one):'アカウント一覧からBotを選ぶと、実行中の操作が表示されます。';const errors=r?Object.entries(r.featureErrors||{}).map(([key,v])=>key+': '+v.message):[];$('error-summary').hidden=!errors.length;$('error-summary').textContent=errors.join('\n');renderTable(bots);renderInventory(one);syncForms(bots);renderEnemies();renderLogs();refreshBusy();$('app-version').textContent='v'+app.state.version;$('updated-at').textContent='最終更新 '+clock(app.state.at);$('owner-name').textContent=app.owner;
 }
 function update(state){app.state=state;render();}
 async function refresh(){if(!app.csrf)return;const data=await api('/api/state');app.csrf=data.csrf;app.owner=data.owner;update(data);}
 function network(up){$('live-status').className='live-badge'+(up?'':' offline');$('live-status').lastChild.nodeValue=up?' LIVE':' 再接続中';}
 function stream(){app.stream?.close();const source=app.stream=new EventSource('/api/events');source.addEventListener('state',event=>{try{update(JSON.parse(event.data));network(true);if(app.poll){clearInterval(app.poll);app.poll=null;}}catch{toast('状態の更新に失敗しました',true);}});source.addEventListener('expired',()=>expired());source.addEventListener('error',()=>{if(!app.csrf)return;network(false);if(!app.poll)app.poll=setInterval(()=>refresh().catch(()=>{}),10000);});}
 async function enter(){const data=await api('/api/state');app.csrf=data.csrf;app.owner=data.owner;$('login-screen').hidden=true;$('app').hidden=false;$('login-error').textContent='';update(data);stream();}
 async function login(code){const button=$('login-form').querySelector('button');button.disabled=true;$('login-error').textContent='ログインしています…';try{const response=await fetch('/api/login',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({code})}),data=await response.json();if(!response.ok)throw Error(data.error);app.csrf=data.csrf;await enter();}catch(e){$('login-error').textContent=e.message;}finally{button.disabled=false;}}
 async function logout(){try{await api('/api/logout',{});}catch{}expired('ログアウトしました。再度Discordの /web から開いてください。');}
 const onForm=(id,run)=>$(id).addEventListener('submit',async event=>{event.preventDefault();const button=$(id).querySelector('[type="submit"]'),values=Object.fromEntries(new FormData($(id)));button.disabled=true;try{await run(values);}catch(e){result(e.message,true);}finally{button.disabled=false;}});
 onForm('login-form',values=>login(values.code));
 onForm('move-form',v=>command(`goto ${v.mode} ${v.dimension} ${v.x} ${v.y} ${v.z}`));
 onForm('speed-form',v=>executeMany([`flyspeed ${v.horizontal} ${v.vertical}`,`chasespeed ${v.chase}`,`timer ${v.timer}`]));
 onForm('health-form',v=>executeMany([`autoeat on ${v.heal}`,`autolog on ${v.log}`]));
 onForm('predict-form',v=>command('predict '+v.count));
 onForm('mining-form',v=>executeMany([`area ${v.x1} ${v.z1} ${v.x2} ${v.z2}`,`floor ${v.floor}`,`ceiling ${v.ceiling}`]));
 onForm('scaffold-form',v=>command('scaffold '+v.block));
 onForm('enemy-form',v=>command('enemy add '+v.name.trim()));
 onForm('command-form',async v=>{await command(v.command);$('command-dialog').close();});
 onForm('chat-form',async v=>{try{const data=await api('/api/chat',{target:app.target,type:v.type,recipient:v.recipient,message:v.message});result(data.result);}catch(e){result(e.message,true);}});
 $('login-code').addEventListener('input',()=>{$('login-error').textContent='';});
 document.querySelectorAll('[data-target]').forEach(button=>button.addEventListener('click',()=>choose(button.dataset.target)));
 document.querySelectorAll('[data-tab]').forEach(button=>button.addEventListener('click',()=>switchTab(button.dataset.tab)));
 document.querySelectorAll('[data-command]').forEach(button=>button.addEventListener('click',()=>command(button.dataset.command).catch(()=>{})));
 $('mobile-target').addEventListener('change',event=>choose(event.target.value));$('logout').addEventListener('click',logout);$('mobile-logout').addEventListener('click',logout);$('refresh').addEventListener('click',()=>refresh().catch(e=>toast(e.message,true)));
 $('copy-position').addEventListener('click',async()=>{const bot=selected()[0];try{await navigator.clipboard.writeText(position(bot.position));toast('座標をコピーしました');}catch{toast(position(bot.position));}});
 $('dismiss-result').addEventListener('click',()=>$('result-panel').hidden=true);
 $('auth').addEventListener('click',async()=>{try{const data=await api('/api/auth?target='+encodeURIComponent(app.target));$('auth-message').textContent=data.message;$('auth-dialog').showModal();}catch(e){toast(e.message,true);}});
 $('refresh-view').addEventListener('click',async()=>{const target=app.target,button=$('refresh-view');button.disabled=true;try{const response=await fetch('/api/view?target='+encodeURIComponent(target),{credentials:'same-origin'});if(!response.ok){const value=await response.json();throw Error(value.error);}const image=await response.blob();if(app.target!==target)return;if(app.viewURL)URL.revokeObjectURL(app.viewURL);app.viewURL=URL.createObjectURL(image);$('view-image').src=app.viewURL;$('view-image').hidden=false;$('view-placeholder').hidden=true;$('view-caption').textContent=clock(Number(response.headers.get('X-View-Captured-At'))||Date.now())+' に生成 / 受信地形のみ。UI・プレイヤーは表示しません。';}catch(e){toast(e.message,true);}finally{button.disabled=!selected()[0]?.connected;}});
 $('open-command').addEventListener('click',()=>$('command-dialog').showModal());document.querySelectorAll('[data-close-dialog]').forEach(button=>button.addEventListener('click',()=>button.closest('dialog').close()));
 $('chat-type').addEventListener('change',event=>{$('recipient-label').hidden=event.target.value!=='whisper';$('chat-form').elements.namedItem('recipient').required=event.target.value==='whisper';});
 $('pause-log').addEventListener('click',()=>{app.pausedLog=!app.pausedLog;$('pause-log').textContent=app.pausedLog?'更新を再開':'更新を一時停止';renderLogs();});$('log-filter').addEventListener('input',renderLogs);
 $('equip-item').addEventListener('click',async()=>{try{const data=await api('/api/equip',{target:app.target,slot:app.selectedSlot});result(data.result);await refresh();}catch(e){result(e.message,true);}});
 $('download-report').addEventListener('click',async()=>{try{const response=await fetch('/api/report?target='+encodeURIComponent(app.target),{credentials:'same-origin'});if(!response.ok){const data=await response.json();throw Error(data.error);}const url=URL.createObjectURL(await response.blob()),a=el('a');a.href=url;a.download='bot-report.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){toast(e.message,true);}});
 const code=new URLSearchParams(location.hash.slice(1)).get('login');if(code){history.replaceState(null,'',location.pathname);enter().catch(()=>login(code));}else enter().catch(()=>{});
})();
