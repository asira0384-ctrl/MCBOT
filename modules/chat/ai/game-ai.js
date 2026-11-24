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
function debug(m,id,stage,reason){if(!m.store.data.gameAI?.debug)return;const list=m.aiDebug??=[];const last=list.at(-1);if(last?.id===id&&last.stage===stage&&last.reason===reason&&Date.now()-last.at<1000)return;list.push({at:Date.now(),id,stage,reason});if(list.length>80)list.shift();}
function gemModel(c){const v=(process.env.GEMINI_MODEL||'').trim();return v||(/^gemini-[a-zA-Z0-9._-]+$/.test(c.model)?c.model:'gemini-3.1-flash-lite');}
function settings(store){
 const c=store.data.gameAI||{};return {provider:"gemini",debug:!!c.debug,mode:c.mode||'list',allow:c.allow||[],notes:c.notes||[],city:c.city||process.env.AI_WEATHER_CITY||'Tokyo',model:gemModel(c),keySource:process.env.GEMINI_API_KEY?.trim()?'Railway':store.data.geminiSecret?'Web':'未設定'};
}
function configure(store,d){
 const bad=()=>{throw Object.assign(Error('AI設定の入力内容・件数・文字数を確認してください'),{status:400});};
 const lines=(v,count,len)=>{if(typeof v!=='string')bad();const rows=v.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);if(rows.length>count||rows.some(s=>s.length>len))bad();return rows;};
 const provider='gemini',slot='geminiSecret';
 if(!['all','list'].includes(d.mode)||typeof d.city!=='string'||!d.city.trim()||d.city.length>80||!/^gemini-[a-zA-Z0-9._-]{1,93}$/.test(d.model)||typeof d.key!=='string'||(d.key&&!(/^(?!sk-)[A-Za-z0-9_-]{20,512}$/).test(d.key))||(d.key&&d.clearKey))bad();
 const next={provider,debug:d.debug===true,mode:d.mode,allow:[...new Set(lines(d.allow,200,64).map(s=>norm(s.replace(/^@/,''))))],notes:lines(d.notes,30,500),city:d.city.trim(),model:d.model};
 const old=store.data.gameAI,secret=store.data[slot];
 try{store.data.gameAI=next;if(d.key)store.data[slot]=d.key;else if(d.clearKey===true)delete store.data[slot];store.save();}catch(e){store.data.gameAI=old;store.data[slot]=secret;throw e;}
 return settings(store);
}
async function handle(m,w,p,chat){
 if(m.store.data.desktopAIEnabled===false)return false;
 const match=/^!(aig|ai)(?=$|\s|[ぁ-んァ-ヶ一-龠？?@])\s*(.*)$/iu.exec(chat.message);if(!match)return false;
 debug(m,w.id,'受信','!ai コマンドを認識');const cfg=m.store.data.gameAI??={mode:'list',allow:[],notes:[]};
 const admin=m.store.authorized(p,w.bot.players),profile=w.bot.players.get(norm(chat.name));
 const verified=['chat','whisper'].includes(p.type)&&p.xuid&&String(profile?.xuid)===String(p.xuid)&&norm(p.source_name)===norm(chat.name);
 // Display-only server chat can answer read-only questions for an online allowed MCID.
 // Never grant training or operator commands from a formatted display name.
 const registered=profile&&(cfg.allow.includes(norm(chat.name))||(m.store.data.admins||[]).some(a=>norm(a.name)===norm(chat.name)&&a.xuid&&String(a.xuid)===String(profile.xuid)));
 const senderOK=(!p.source_name||norm(p.source_name)===norm(chat.name))&&(!p.xuid||/^0+$/.test(String(p.xuid))||String(p.xuid)===String(profile?.xuid));
 const training=match[1].toLowerCase()==='aig';if(training?!(admin&&verified):!admin&&!(cfg.mode==='all'||senderOK&&registered)){debug(m,w.id,'権限','公開範囲・許可MCID・本人確認を確認');m.trace?.(w.id,'AI: '+chat.name+' の質問・指示を権限設定で拒否（公開範囲・許可MCIDを確認）');return true;}
 const scope=w.bot.config.host+':'+w.bot.config.port,now=Date.now();m.aiSeen??=new Map();for(const [k,t] of m.aiSeen)if(now-t>15000)m.aiSeen.delete(k);
 const k=scope+'|'+norm(chat.name)+'|'+norm(chat.message);if(now-(m.aiSeen.get(k)||0)<(training?1500:5000)){debug(m,w.id,'抑制','同じプレイヤーへの短時間の重複返信');return true;}m.aiSeen.set(k,now);
 const say=t=>{if(!w.bot.connected||m.workers.get(w.id)!==w)return;const ok=w.bot.chat(reply(w.id,chat.name,t),false,{priority:true,dedupeMs:5000});debug(m,w.id,'返信',ok===false?'未送信：待機上限または重複':'キュー受付（サーバー表示未確認）');m.trace?.(w.id,ok===false?'AI: 待機上限または重複制限で未送信':'AI: 返信を送信キューに受付');};const q=(match[2]||'').trim().slice(0,500);
 try{
 if(training){
 const target=/全(?:て|部|員|ボット|bot)|すべて|みんな|all\s*bot/i.test(q)?'all':String(w.id);
 const mention=q.match(/@"([^"]{1,32})"|@([a-z0-9_-]{1,32})/i);let action;
 if(/スキン|skin/i.test(q)&&mention)action='skinstealer '+(mention[1]||mention[2]);
 else if(/エモート|踊|emote/i.test(q)){const sec=q.match(/(\d+)\s*秒/);if(/停止|やめ|off/i.test(q))action='autoemote off';else if(sec)action='autoemote '+sec[1];}
 if(action){say(await m.execute(target,action,'game'));return true;}
 let a;if(/^(公開|限定)$/.test(q))cfg.mode=q==='公開'?'all':'list';
 else if((a=/^(許可|解除)\s+@(.+)$/.exec(q))){cfg.allow=cfg.allow.filter(n=>n!==norm(a[2]));if(a[1]==='許可')cfg.allow.push(norm(a[2]));}
 else if((a=/^記憶\s+(.+)$/.exec(q)))cfg.notes=[...cfg.notes,a[1]].slice(-30);
 else if((a=/^採掘\s+(-?\d+\s+-?\d+\s+-?\d+\s+-?\d+)$/.exec(q))){await m.execute(String(w.id),'area '+a[1]);say(await m.execute(String(w.id),'start'));return true;}
 else if((a=/^攻撃許可\s+@(.+)$/.exec(q))){say(await m.execute(String(w.id),'enemy add '+a[1]));return true;}
 else {const cmd=await require('../../../src/shared/intent')(q,gemModel(cfg),process.env.GEMINI_API_KEY?.trim()||m.store.data.geminiSecret);if(!cmd){say('対象や操作を特定できんかった。例：すべてのBotを @asira0384 のスキンにして');return true;}say(await m.execute(target,cmd,'game'));return true;}
 m.store.save();say('保存したで。');return true;
 }
 if(!q){say('例：!ai いまなにしてる？ / !ai 天気 Osaka');return true;}
 if(/天気|予報/.test(q)){const city=q.match(/(?:天気|予報)\s+([^？?]+)$/)?.[1]||q.match(/^(.+?)の(?:今日の)?天気/)?.[1];say(await weather(city&&city!=='今日'?city:cfg.city||process.env.AI_WEATHER_CITY||'Tokyo'));return true;}
 const status=w.running?'採掘中。'+(w.miner?.state||'')+(w.missing?' / '+w.missing:''):w.runtime?.circle?'今は '+w.runtime.circle.name+' の周りで円を作ってるで。':w.bot.dead?'今はリスポーン待ちやで。':w.missing?'今は '+w.missing+' を待ってるで。':w.mode==='stopped'||w.mode==='dead'?'今は待機中やで。採掘はしてないで。':'今は '+(w.runtime?.travel?.waiting||w.mode)+'。';
 if(/何して|なにして|何をして|なにをして|状態/.test(q)){say(status);return true;}
 const apiKey=process.env.GEMINI_API_KEY?.trim()||m.store.data.geminiSecret;if(!apiKey){debug(m,w.id,'API','キー未設定');say('今の状態と天気は答えられるで。自由質問は管理者がAPIキーを設定してな。');return true;}
 const model=gemModel(cfg);debug(m,w.id,'API','Gemini: '+model);const r=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model)+':generateContent',{method:'POST',signal:AbortSignal.timeout(12000),headers:{'x-goog-api-key':apiKey,'Content-Type':'application/json'},body:JSON.stringify({systemInstruction:{parts:[{text:'Minecraft統合版のBotとして日本語で簡潔に回答。2e/2b2eはアナーキーサーバー、IGN/ignpvpはPvPサーバー。HvHはチート使用者同士の対戦、KAはKillAura、CAはCrystalAura、rekitは装備・物資をキットで再補充すること。知らない鯖固有のルールや人物については推測しない。操作は実行できない。現在の状態: '+status+' 管理者メモ: '+(cfg.notes||[]).join(' / ')}]},contents:[{role:'user',parts:[{text:q}]}]})});if(!r.ok){debug(m,w.id,'API','HTTP '+r.status);const hints={401:'APIキーを確認してな',403:'APIの利用権限を確認してな',404:'Webのモデル名を確認してな',429:'Geminiの利用上限やで。少し時間を空けてな'};say('Gemini接続エラー '+r.status+'：'+(hints[r.status]||'少し待ってな'));return true;}const out=(await r.json()).candidates?.[0]?.content?.parts?.filter(p=>!p.thought).map(p=>p.text||'').join('');if(!out)throw Error('空の回答');debug(m,w.id,'API','自由質問の回答を受信');say(out);
 }catch(e){debug(m,w.id,'エラー',e?.name==='TimeoutError'?'通信タイムアウト':training?'管理操作失敗':'通信・応答の読み取り失敗');say(training?'設定または実行に失敗したで。対象と採掘設定を確認してな。':'今は情報を取得できんかった。少し待ってな。');}return true;
}
module.exports={handle,reply,settings,configure,debug};
