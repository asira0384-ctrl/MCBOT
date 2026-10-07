'use strict';
const path=require('node:path');const {BedrockBot}=require('./bedrock');const {Worker}=require('./worker');const {norm,itemName,integer,sleep,emptyStats}=require('./util');
class Manager{
 constructor(store){this.store=store;this.workers=new Map();this.claims=new Map();this.auth=new Map();this.attempts=new Map();this.seen=new Map();this.lastNotice=new Map();this.onNotice=()=>{};
  const names=(process.env.BOT_NAMES||'Aslrq 1st').split(',').map(s=>s.trim()).filter(Boolean);if(!names.length||names.length>10)throw Error('BOT_NAMESは1〜10アカウント');if(new Set(names.map(norm)).size!==names.length)throw Error('同じアカウントは重複登録できません');
  this.names=new Map(names.map((name,i)=>[i+1,name]));this.chatTimer=setTimeout(()=>this.chatter(),600000+Math.random()*600000);
 }
 targets(target){if(target==='all')return [...this.names.keys()];const id=integer(target,1,10);if(!this.names.has(id))throw Error('その番号のアカウントは未設定です');return[id];}
 async connect(id){if(this.workers.has(id))return '接続済み・認証中です。statusで現在の段階を確認できます';const name=this.names.get(id);if(!name)throw Error('番号が未登録です');
  this.auth.delete(id);const attempt={active:true};this.attempts.set(id,attempt);
  const bot=new BedrockBot({id,name,host:process.env.MC_HOST||'2b2e.org',port:integer(process.env.MC_PORT||19132,1,65535),version:process.env.MC_VERSION||undefined,
   authDir:path.join(this.store.dir,'auth',String(id))},data=>{if(!attempt.active||this.attempts.get(id)!==attempt)return;this.auth.set(id,{...data,expires:Date.now()+(data.expires_in||900)*1000});this.onNotice(id,'Microsoft認証待ちです。/authでコードを表示してください');});
  const worker=new Worker(this,id,bot);this.workers.set(id,worker);
  const current=()=>attempt.active&&this.attempts.get(id)===attempt;
  const watchdog=setTimeout(()=>{if(current()&&!bot.connected){this.notice(id,`接続待ちが15分を超えました。段階: ${bot.connectionPhase}`);bot.disconnect();}},15*60*1000);watchdog.unref?.();
  bot.on('authComplete',()=>{if(!current())return;this.auth.delete(id);this.notice(id,'Microsoft認証成功。サーバーへUDP接続中です');});
  bot.on('connectionStage',stage=>{if(current())this.notice(id,stage);});
  bot.on('error',e=>{if(!current())return;worker.stop();const message=e.message==='Connect timed out'?`サーバーへのUDP接続がタイムアウトしました (${process.env.MC_HOST||'2b2e.org'}:${process.env.MC_PORT||19132})。Microsoft認証後の通信で止まっています。`:e.message;this.notice(id,`${message} [段階: ${bot.connectionPhase}]`);});
  bot.on('end',()=>{clearTimeout(watchdog);if(!current())return;attempt.active=false;this.auth.delete(id);this.attempts.delete(id);worker.stop();worker.mode='disconnected';this.notice(id,'接続が切れました。connectで再接続できます');});
  bot.on('spawn',()=>{if(!current())return;clearTimeout(watchdog);this.auth.delete(id);this.notice(id,`${bot.username} が接続しました。まだ採掘は開始していません`);});
  bot.on('chat',p=>{if(!p.message?.startsWith('!')||!this.store.authorized(p,bot.players))return;
   const k=`${p.xuid}:${p.message}`;const now=Date.now();if(now-(this.seen.get(k)||0)<1500)return;this.seen.set(k,now);for(const[k,t]of this.seen)if(now-t>10000)this.seen.delete(k);
   const parts=p.message.slice(1).trim().split(/\s+/);const command=parts.shift(),target=parts.shift();if(!target)return;
   this.execute(target,[command,...parts].join(' '),'game').then(result=>bot.chat(result.slice(0,220))).catch(e=>bot.chat(e.message));
  });return `Bot${id}を接続中です。/auth target:${id} で認証コードを確認してください`;
 }
 notice(id,text){text=String(text).slice(0,500);const k=`${id}:${text}`;if(Date.now()-(this.lastNotice.get(k)||0)<60000)return;this.lastNotice.set(k,Date.now());this.onNotice(id,text);this.workers.get(id)?.bot.chat(`[Bot${String(id).padStart(2,'0')}] ${text}`);}
 assigned(worker,x,z){const a=worker.state.area;const same=[...this.workers.values()].filter(w=>w.bot.connected&&w.state.area&&JSON.stringify(w.state.area)===JSON.stringify(a)&&w.state.floor===worker.state.floor).sort((a,b)=>a.id-b.id);if(same.length<2)return true;const index=same.indexOf(worker);const width=a.x2-a.x1+1;return Math.min(same.length-1,Math.floor((x-a.x1)*same.length/width))===index;}
 authStatus(id){this.targets(String(id));const w=this.workers.get(id),code=this.auth.get(id);
  if(!w||w.mode==='disconnected'||w.bot.ended){this.auth.delete(id);return '切断済みです。/bot target:'+id+' command:connect を実行してください';}
  if(w.bot.connected)return '認証済み・接続済みです。コード入力は不要です';
  if(code&&code.expires>Date.now())return `Bot${id}: Microsoft公式の ${code.verification_uri||'https://www.microsoft.com/link'} を開き、コード **${code.user_code}** を入力してください。Bot用のアカウントでログインしてください。残り約${Math.ceil((code.expires-Date.now())/60000)}分。/authは現在のコードを表示します`;
  if(code){this.auth.delete(id);return '認証コードが期限切れです。disconnect → connect を実行してください';}
  return `Bot${id}: ${w.bot.connectionPhase}。認証済みならコードは発行されません。connectを繰り返さず、接続結果を待ってください`;
 }
 worker(id){const w=this.workers.get(id);if(!w||!w.bot.connected)throw Error(`Bot${id}は未接続です`);return w;}
 async execute(target,text,origin='discord'){const ids=this.targets(String(target));const [cmd,...args]=text.trim().split(/\s+/);if(!cmd)throw Error('コマンドを入力してください');
  if(origin==='game'&&['connect','disconnect','clear-recovery'].includes(cmd))throw Error('この操作はDiscordから行ってください');
  if(['start','scaffold','area','floor','ceiling','supply','chat','respawn','stats-reset','recover','clear-recovery'].includes(cmd)){
   // Validate all targets before changing any persistent setting.
   if(['area','floor','ceiling','scaffold'].includes(cmd))for(const id of ids){const w=this.workers.get(id);if(w?.busy&&cmd!=='scaffold')w.stop();}
  }
  const results=[];
  for(const id of ids){const state=this.store.bot(id),w=this.workers.get(id);
   switch(cmd){
    case 'connect':if(w&&w.mode==='disconnected'){w.destroy();this.workers.delete(id);}results.push(await this.connect(id));break;
    case 'disconnect':w?.destroy();this.workers.delete(id);this.auth.delete(id);this.attempts.delete(id);results.push(`Bot${id}を切断`);break;
    case 'stop':w?.stop();results.push(`Bot${id}停止`);break;
    case 'start':this.worker(id).start();results.push(`Bot${id}開始`);break;
    case 'area':{if(args.length!==4)throw Error('area x1 z1 x2 z2');const [x1,z1,x2,z2]=args.map(v=>integer(v,-30000000,30000000));const area={x1:Math.min(x1,x2),z1:Math.min(z1,z2),x2:Math.max(x1,x2),z2:Math.max(z1,z2)};if((area.x2-area.x1+1)*(area.z2-area.z1+1)>262144)throw Error('最初は512×512ブロック以内にしてください');w?.stop();state.area=area;if(w)w.survey=0;results.push(`Bot${id} 範囲 ${JSON.stringify(area)}`);break;}
    case 'floor':{const n=integer(args[0],-64,318);if(n>=state.ceiling)throw Error('床はceilingより低く指定');w?.stop();state.floor=n;results.push(`Bot${id}: Y=${n}以下を残す`);break;}
    case 'ceiling':{const n=integer(args[0],-63,319);if(state.floor!==null&&n<=state.floor)throw Error('ceilingは床より上');w?.stop();state.ceiling=n;results.push(`Bot${id}: Y=${n}まで採掘`);break;}
    case 'scaffold':{if(args[0]==='receive'){this.worker(id).receive();results.push(`Bot${id}受け取り待ち`);break;}const worker=this.worker(id);worker.stop();let name=itemName(args[0]||'');const alias={slime_block:'slime',スライム:'slime',スライムブロック:'slime',丸石:'cobblestone',砂:'sand',黒曜石:'obsidian'};name=alias[name]||name;
     if(/^\d+$/.test(name))name=worker.bot.registry.blocks[Number(name)]?.name||'';if(!name||!worker.bot.registry.blocksByName[name]||!worker.bot.registry.itemsByName[name])throw Error('ブロック名・対応レジストリの数値IDを指定してください');state.scaffold=name;results.push(`Bot${id}足場 ${name}`);break;}
    case 'supply':case 'chat':case 'respawn':{if(!['on','off'].includes(args[0]))throw Error(`${cmd} on / off`);state[{supply:'autoSupply',chat:'chat',respawn:'respawn'}[cmd]]=args[0]==='on';results.push(`Bot${id} ${cmd}=${args[0]}`);break;}
    case 'status':results.push(JSON.stringify(w?.status()||{number:id,name:this.names.get(id),mode:'offline',scaffold:state.scaffold}));break;
    case 'stats':results.push(`Bot${id}: 累計 ${state.stats.total} (黒曜石 ${state.stats.obsidian} / その他 ${state.stats.other}) / 今回 ${state.session.total}`);break;
    case 'stats-reset':state.session=emptyStats();results.push(`Bot${id}今回の数をリセット。累計は保持`);break;
    case 'recover':this.worker(id).stop();results.push(await this.worker(id).recover());break;
    case 'clear-recovery':if(args[0]!=='confirm')throw Error('箱を手動回収した後、clear-recovery confirm を実行');if(w?.busy)throw Error('操作中です');state.supplyPending=null;results.push(`Bot${id}補給待機情報を解除`);break;
    default:throw Error('connect / start / stop / status / stats / area / floor / ceiling / scaffold / supply / chat / respawn / recover');
   }this.store.save();
   if(cmd==='connect'&&ids.length>1)await sleep(1500);
  }
  if(cmd==='stats'&&ids.length>1)results.push(`全体合計: ${ids.reduce((sum,id)=>sum+this.store.bot(id).stats.total,0)}ブロック`);
  return results.join('\n');
 }
 chatter(){const bots=[...this.workers.values()].filter(w=>w.running&&w.mode==='running'&&w.state.chat&&w.bot.connected);
  if(bots.length){const first=bots[Math.floor(Math.random()*bots.length)];const pairs=[['黒曜石、多いな。','こっちもまだ掘ってる。'],['そっちは進んでる？','少しずつ進んでるで。'],['整地中やで。','こっちも作業中。']];const [a,b]=pairs[Math.floor(Math.random()*pairs.length)];first.bot.chat(`[Bot${first.id}] ${a}`);
   const second=bots.find(w=>w.id!==first.id);if(second)setTimeout(()=>{if(second.running&&second.mode==='running'&&second.state.chat)second.bot.chat(`[Bot${second.id}] ${b}`);},5000);
  }this.chatTimer=setTimeout(()=>this.chatter(),600000+Math.random()*1200000);
 }
 destroy(){clearTimeout(this.chatTimer);for(const w of this.workers.values())w.destroy();this.store.save();}
}
module.exports={Manager};
