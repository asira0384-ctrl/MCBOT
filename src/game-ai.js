'use strict';
const norm=s=>String(s).normalize('NFKC').trim().toLowerCase();
const clean=s=>String(s).replace(/[\r\n§\x00-\x1f]/g,' ').trim();
function reply(id,name,text){return '[Bot'+id+'][IGNGPT] @'+clean(name).slice(0,48)+' '+clean(text).slice(0,180);}
async function weather(city){
 const get=async url=>{const r=await fetch(url,{signal:AbortSignal.timeout(5000)});if(!r.ok)throw Error();return r.json();};
 const loc=(await get('https://geocoding-api.open-meteo.com/v1/search?language=ja&count=1&name='+encodeURIComponent(city))).results?.[0];
 if(!loc)return '都市が見つからんかった。例：!ai 天気 Tokyo';
 const d=(await get('https://api.open-meteo.com/v1/forecast?latitude='+loc.latitude+'&longitude='+loc.longitude+'&timezone=auto&forecast_days=1&daily=weather_code,temperature_2m_max,temperature_2m_min')).daily;
 const c=d.weather_code[0];return loc.name+'の今日の予報は'+(c===0?'晴れ':c<=2?'晴れ時々曇り':c===3?'曇り':c<50?'霧':c>=95?'雷雨':(c>=71&&c<=77)||c>=85?'雪':'雨')+'、最低'+d.temperature_2m_min[0]+'℃・最高'+d.temperature_2m_max[0]+'℃やで。';
}
function settings(store){
 const c=store.data.gameAI||{};return {mode:c.mode||'list',allow:c.allow||[],notes:c.notes||[],city:c.city||process.env.AI_WEATHER_CITY||'Tokyo',model:c.model||process.env.AI_MODEL||'gpt-4o-mini',keySource:store.data.webAISecret?'Web':process.env.OPENAI_API_KEY?'Railway':'未設定'};
}
function configure(store,d){
 const bad=()=>{throw Object.assign(Error('AI設定の入力内容・件数・文字数を確認してください'),{status:400});};
 const lines=(v,count,len)=>{if(typeof v!=='string')bad();const rows=v.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);if(rows.length>count||rows.some(s=>s.length>len))bad();return rows;};
 if(!['all','list'].includes(d.mode)||typeof d.city!=='string'||!d.city.trim()||d.city.length>80||!/^[-a-zA-Z0-9._:]{1,100}$/.test(d.model)||typeof d.key!=='string'||(d.key&&!/^sk-[A-Za-z0-9_-]{12,480}$/.test(d.key))||(d.key&&d.clearKey))bad();
 const next={mode:d.mode,allow:[...new Set(lines(d.allow,200,64).map(s=>norm(s.replace(/^@/,''))))],notes:lines(d.notes,30,500),city:d.city.trim(),model:d.model};
 const old=store.data.gameAI,secret=store.data.webAISecret;
 try{store.data.gameAI=next;if(d.key)store.data.webAISecret=d.key;else if(d.clearKey===true)delete store.data.webAISecret;store.save();}catch(e){store.data.gameAI=old;store.data.webAISecret=secret;throw e;}
 return settings(store);
}
async function handle(m,w,p,chat){
 const match=/^!(aig|ai)(?:\s+(.+))?$/iu.exec(chat.message);if(!match)return false;
 const cfg=m.store.data.gameAI??={mode:'list',allow:[],notes:[]};
 const admin=m.store.authorized(p,w.bot.players),profile=w.bot.players.get(norm(chat.name));
 const verified=['chat','whisper'].includes(p.type)&&p.xuid&&String(profile?.xuid)===String(p.xuid)&&norm(p.source_name)===norm(chat.name);
 // Display-only server chat can answer read-only questions for an online allowed MCID.
 // Never grant training or operator commands from a formatted display name.
 const registered=profile&&(cfg.allow.includes(norm(chat.name))||(m.store.data.admins||[]).some(a=>norm(a.name)===norm(chat.name)&&a.xuid&&String(a.xuid)===String(profile.xuid)));
 const senderOK=(!p.source_name||norm(p.source_name)===norm(chat.name))&&(!p.xuid||/^0+$/.test(String(p.xuid))||String(p.xuid)===String(profile?.xuid));
 const training=match[1].toLowerCase()==='aig';if(training?!(admin&&verified):!admin&&!(cfg.mode==='all'||senderOK&&registered))return true;
 const scope=w.bot.config.host+':'+w.bot.config.port,now=Date.now();m.aiSeen??=new Map();for(const [k,t] of m.aiSeen)if(now-t>15000)m.aiSeen.delete(k);
 const k=scope+'|'+norm(chat.name);if(now-(m.aiSeen.get(k)||0)<(training?1500:5000))return true;m.aiSeen.set(k,now);
 const say=t=>{if(w.bot.connected)m.workers.get(w.id)===w&&w.bot.chat(reply(w.id,chat.name,t),false,{priority:true,dedupeMs:5000});};const q=(match[2]||'').trim().slice(0,500);
 try{
 if(training){
 let a;if(/^(公開|限定)$/.test(q))cfg.mode=q==='公開'?'all':'list';
 else if((a=/^(許可|解除)\s+@(.+)$/.exec(q))){cfg.allow=cfg.allow.filter(n=>n!==norm(a[2]));if(a[1]==='許可')cfg.allow.push(norm(a[2]));}
 else if((a=/^記憶\s+(.+)$/.exec(q)))cfg.notes=[...cfg.notes,a[1]].slice(-30);
 else if((a=/^採掘\s+(-?\d+\s+-?\d+\s+-?\d+\s+-?\d+)$/.exec(q))){await m.execute(String(w.id),'area '+a[1]);say(await m.execute(String(w.id),'start'));return true;}
 else if((a=/^攻撃許可\s+@(.+)$/.exec(q))){say(await m.execute(String(w.id),'enemy add '+a[1]));return true;}
 else {say('公開 / 限定 / 許可 @MCID / 解除 @MCID / 記憶 内容 / 採掘 x1 z1 x2 z2 / 攻撃許可 @MCID');return true;}
 m.store.save();say('保存したで。');return true;
 }
 if(!q){say('例：!ai いまなにしてる？ / !ai 天気 Osaka');return true;}
 if(/天気|予報/.test(q)){const city=q.match(/(?:天気|予報)\s+([^？?]+)$/)?.[1]||q.match(/^(.+?)の(?:今日の)?天気/)?.[1];say(await weather(city&&city!=='今日'?city:cfg.city||process.env.AI_WEATHER_CITY||'Tokyo'));return true;}
 const status=w.running?'採掘中。'+(w.miner?.state||'')+(w.missing?' / '+w.missing:''):'状態は '+w.mode+'。'+(w.runtime?.travel?.waiting||'');
 if(/何して|なにして|何をして|なにをして|状態/.test(q)){say(status);return true;}
 const apiKey=m.store.data.webAISecret||process.env.OPENAI_API_KEY;if(!apiKey){say('今の状態と天気は答えられるで。自由質問は管理者がAPIキーを設定してな。');return true;}
 const r=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',signal:AbortSignal.timeout(12000),headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},body:JSON.stringify({model:cfg.model||process.env.AI_MODEL||'gpt-4o-mini',messages:[{role:'system',content:'MinecraftのBotとして日本語で簡潔に回答。操作は実行できない。現在の状態: '+status+' 管理者メモ: '+cfg.notes.join(' / ')},{role:'user',content:q}]})});if(!r.ok){const hints={401:'APIキーを確認してな',403:'APIの利用権限を確認してな',404:'Webのモデル名を確認してな',429:'APIの残高または利用制限を確認してな'};say('AI接続エラー '+r.status+'：'+(hints[r.status]||'少し待ってな'));return true;}say((await r.json()).choices[0].message.content);
 }catch{say(training?'設定または実行に失敗したで。対象と採掘設定を確認してな。':'今は情報を取得できんかった。少し待ってな。');}return true;
}
module.exports={handle,reply,settings,configure};
