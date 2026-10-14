'use strict';
const {ActionRowBuilder,ButtonBuilder,ButtonStyle,StringSelectMenuBuilder,ChannelSelectMenuBuilder,ChannelType,ModalBuilder,TextInputBuilder,TextInputStyle,MessageFlags}=require('discord.js');
const {norm}=require('./util');const {defaults}=require('./runtime');
const CID='acb:';
const pages={home:'操作',gear:'装備・受け取り',combat:'敵・戦闘',travel:'移動',mining:'整地',logs:'ログ・管理者',chat:'チャット'};
const row=(...components)=>new ActionRowBuilder().addComponents(...components);
function button(id,label,style=ButtonStyle.Secondary,disabled=false){return new ButtonBuilder().setCustomId(CID+id).setLabel(label.slice(0,80)).setStyle(style).setDisabled(disabled);}
class ControlPanel{
 constructor(manager,owner){this.manager=manager;this.owner=owner;this.sessions=new Map();}
 entryMessage(){return {content:`Minecraft Bot v${require('../package.json').version} 起動済み。下のボタンで管理画面を開けます。`,components:[row(button('open','操作パネルを開く',ButtonStyle.Primary))],allowedMentions:{parse:[]}};}
 ids(s){return this.manager.targets(s.target);}
 settings(s){return this.ids(s).map(id=>Object.assign({},defaults,this.manager.store.bot(id).runtime));}
 toggle(s,key,label){const all=this.settings(s).every(c=>c[key]),any=this.settings(s).some(c=>c[key]);return button('toggle:'+key,`${label}: ${all?'ON':any?'混在':'OFF'}`,all?ButtonStyle.Success:ButtonStyle.Secondary);}
 render(s){
  const selected=this.ids(s),first=this.manager.workers.get(selected[0]),connected=selected.every(id=>this.manager.workers.get(id)?.bot.connected),one=selected.length===1;
  const menu=new StringSelectMenuBuilder().setCustomId(CID+'target').setPlaceholder('操作するBotを選ぶ').addOptions([...this.manager.names].map(([id,name])=>({label:`Bot${id} / ${name}`.slice(0,100),value:String(id),default:s.target===String(id)}))).addOptions({label:'全Bot',value:'all',default:s.target==='all'});
  const components=[row(menu)];
  if(s.page==='home'){
   components.push(row(button('connect','接続',ButtonStyle.Success),button('disconnect','切断',ButtonStyle.Danger),button('stop','停止',ButtonStyle.Danger),button('auth','認証コード',ButtonStyle.Secondary,!one),button('refresh','更新')));
   components.push(row(button('receive','装備・箱を受け取る',ButtonStyle.Primary,!connected),button('page:travel','移動',ButtonStyle.Primary),button('view','視点画像',ButtonStyle.Secondary,!connected||!one),button('report','状態レポート')));
   components.push(row(button('page:gear','装備設定'),button('page:combat','敵・戦闘'),button('page:mining','整地'),button('page:logs','ログ・管理者'),button('page:chat','チャット')));
  }else if(s.page==='chat'){components.push(row(button('form:say','公開チャットに送信',ButtonStyle.Primary,!connected),button('form:w','tellを送信',ButtonStyle.Primary,!connected)));
   components.push(row(button('greeter-status','グリーター設定確認'),button('greeter-test','挨拶をテスト送信',ButtonStyle.Secondary,!connected)));
  }else if(s.page==='gear'){
   components.push(row(this.toggle(s,'gear','自動防具'),this.toggle(s,'autototem','AutoTotem'),this.toggle(s,'autoslot','AutoSlot'),this.toggle(s,'heal','回復'),button('respawn',`自動リスポーン: ${selected.every(id=>this.manager.store.bot(id).respawn)?'ON':'OFF'}`,selected.every(id=>this.manager.store.bot(id).respawn)?ButtonStyle.Success:ButtonStyle.Secondary)));
   components.push(row(button('receive','装備・箱を受け取る',ButtonStyle.Primary,!connected),button('sort','今すぐ並べる',ButtonStyle.Primary,!connected),button('recover-box','箱の回収を再試行',ButtonStyle.Secondary,!connected),button('form:heal','回復する体力を設定')));
   const mode=selected.length===1?this.manager.workers.get(selected[0])?.bot.inventoryMode||'auto':'auto';components.push(row(new StringSelectMenuBuilder().setCustomId(CID+'inventory-mode').setPlaceholder('インベントリ通信方式').addOptions([{label:'サーバー指定で自動',value:'auto',default:mode==='auto'},{label:'スロットの成功応答を使う',value:'stack',default:mode==='stack'},{label:'従来方式・実スロット更新で確認',value:'legacy',default:mode==='legacy'}])));
  }else if(s.page==='combat'){
   components.push(row(this.toggle(s,'killaura','指定敵を攻撃'),this.toggle(s,'anticrystal','AntiCrystal'),this.toggle(s,'autolog','AutoLog'),this.toggle(s,'crystalaura','CA'),this.toggle(s,'pistoncrystal','PA')));
   components.push(row(button('form:enemy-add','敵を登録',ButtonStyle.Primary),button('form:enemy-remove','敵を解除'),button('enemy-list','敵一覧'),button('form:autolog','切断する体力')));
   components.push(row(button('form:depth','埋まる深さ'),button('pvp-start','PvP開始',ButtonStyle.Danger),button('pvp-stop','PvP停止')));
  }else if(s.page==='travel'){
   components.push(row(new StringSelectMenuBuilder().setCustomId(CID+'mode').setPlaceholder('移動方法').addOptions([{label:'Jetpack',value:'jetpack',default:s.mode==='jetpack'},{label:'歩く',value:'walk',default:s.mode==='walk'},{label:'邪魔なブロックを掘って歩く',value:'dig',default:s.mode==='dig'},{label:'エリトラで飛ぶ',value:'fly',default:s.mode==='fly'}])));
   components.push(row(new StringSelectMenuBuilder().setCustomId(CID+'dimension').setPlaceholder('移動先の世界').addOptions([{label:'現世',value:'overworld',default:s.dimension==='overworld'},{label:'ネザー（入口を探す）',value:'nether',default:s.dimension==='nether'}])));
   components.push(row(button('form:move','座標を入力して移動',ButtonStyle.Primary,!connected),button('form:speed','飛行速度'),button('escape','水から避難',ButtonStyle.Secondary,!connected),button('stop','停止',ButtonStyle.Danger)));
  }else if(s.page==='mining'){
   components.push(row(button('form:area','範囲と床を設定',ButtonStyle.Primary),button('start','整地を開始',ButtonStyle.Success,!connected),button('stop','停止',ButtonStyle.Danger),button('form:scaffold','足場を指定')));
   components.push(row(button('scaffold-receive','足場を受け取る',ButtonStyle.Secondary,!connected),button('recover','EC補給の回収',ButtonStyle.Secondary,!connected),button('stats','採掘数')));
  }else if(s.page==='logs'){
   components.push(row(new ChannelSelectMenuBuilder().setCustomId(CID+'channel').setPlaceholder('ログの通知先を選ぶ').setChannelTypes(ChannelType.GuildText,ChannelType.GuildAnnouncement)));
   components.push(row(button('live',`5秒更新ログ: ${this.manager.store.data.liveLog?'ON':'OFF'}`,this.manager.store.data.liveLog?ButtonStyle.Success:ButtonStyle.Secondary),button('messages','サーバー案内'),button('report','状態レポート')));
   components.push(row(button('form:admin-add','ゲーム内管理者を登録',ButtonStyle.Primary),button('form:admin-remove','管理者を解除'),button('admin-list','管理者一覧')));
  }
  if(s.page!=='home')components.push(row(button('page:home','戻る'),button('refresh','更新')));
  const fields=selected.map(id=>{const w=this.manager.workers.get(id),b=w?.bot,r=w?.runtime?.snapshot(),p=b?.entity?.position;const status=!b?.connected?(b?.connectionPhase||'未接続'):b.dead?'死亡・リスポーン待ち':r?.waterSafety?.active?r.waterSafety.state:r?.operation?`処理中: ${r.operation}`:r?.pendingMove?'移動命令待ち':r?.movement||w.mode;
   const errors=Object.entries(r?.featureErrors||{}).map(([k,e])=>`${k}: ${e.message}`).join('\n');const text=[status,p?`座標: ${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)} / ${['現世','ネザー','エンド'][b.dimensionId]}`:'',`体力: ${b?.health===null||b?.health===undefined?'未受信':b.health/2+'♥'} / 手: ${r?.offhand||'なし'}`,errors||r?.lastError||r?.lastEvent?.text||''].filter(Boolean).join('\n');return {name:`Bot${id} / ${this.manager.names.get(id)}`,value:text.slice(0,480),inline:false};});
  let description=s.page==='gear'?'受け取り後は剣1・ツルハシ2・ガップル3へ並べます。':s.page==='travel'?'方法と世界を選び、座標入力を押してください。ネザー座標はネザー内の値です。':s.page==='combat'?'登録した敵だけを攻撃します。ボタンは機能の設定です。':s.page==='mining'?'床Y以下は残します。開始前に範囲・床・装備を設定してください。':'操作するBotを選んでボタンを押してください。';
  if(s.page==='chat')description=this.ids(s).map(id=>{const b=this.manager.workers.get(id)?.bot,t=b?this.manager.greetings?.targetFor?.(b):id===11?process.env.IGN_GREET_TARGET_ID:process.env.GREET_TARGET_ID;return `Bot${id}: グリーター ${t?'ON / 対象ID: '+t:'OFF（対象ID未設定）'}`;}).join('\n')||this.manager.greetings?.status()||'公開チャットとtellを送信できます。';
  if(s.result)description+='\n'+s.result.slice(0,600);
  return {content:'',embeds:[{title:`Bot管理 / ${pages[s.page]} / v${require('../package.json').version}`,description,fields,color:0x5865f2}],components,allowedMentions:{parse:[]}};
 }
 async create(i,target){for(const [id,s]of this.sessions)if(Date.now()-s.updatedAt>3600000)this.sessions.delete(id);const selected=target||String([...this.manager.names.keys()][0]);this.manager.targets(selected);const s={target:selected,page:'home',mode:'walk',dimension:'overworld',updatedAt:Date.now()};const message=await i.editReply(this.render(s));this.sessions.set(message.id,s);}
 modal(id,s,form){const current=this.manager.workers.get(this.ids(s)[0]),b=current?.bot,c=this.settings(s)[0];const p=b?.entity?.position||{x:0,y:64,z:0};const definitions={
  say:['公開チャットに送信',[['message','メッセージ','']]],w:['tellを送信',[['id','相手のゲーマータグ（空白対応）',''],['message','メッセージ','']]],
  move:['移動先の座標',[['x','X',Math.floor(p.x)],['y','Y',Math.floor(p.y)],['z','Z',Math.floor(p.z)]]],
  speed:['飛行速度（ブロック/秒）',[['horizontal','横の速度',c.flyHorizontal*20],['vertical','上下の速度',c.flyVertical*20]]],
  'enemy-add':['敵を登録',[['name','敵のゲーマータグ','']]],'enemy-remove':['敵を解除',[['name','敵のゲーマータグ','']]],
  'admin-add':['ゲーム内管理者を登録',[['name','ゲーマータグ',''],['xuid','XUID（一覧から取得できる時は空欄）','',false]]],'admin-remove':['管理者を解除',[['name','ゲーマータグ','']]],
  autolog:['切断する体力',[['hearts','何ハート以下で切断するか',c.logHearts]]],heal:['回復する体力',[['hearts','何ハート未満で食べるか',c.healHearts]]],depth:['AntiCrystal',[['depth','埋まる深さ（ブロック）',c.burrowDepth]]],
  area:['整地の範囲と床',[['x1','始点X',''],['z1','始点Z',''],['x2','終点X',''],['z2','終点Z',''],['floor','残す床のY','64']]],scaffold:['足場を指定',[['block','ブロック名（例: cobblestone）','cobblestone']]]};
  const def=definitions[form];if(!def)throw Error('入力画面がありません');return new ModalBuilder().setCustomId(`${CID}modal:${form}:${id}`).setTitle(def[0]).addComponents(def[1].map(([key,label,value,required=true])=>row(new TextInputBuilder().setCustomId(key).setLabel(label).setStyle(key==='message'?TextInputStyle.Paragraph:TextInputStyle.Short).setRequired(required).setMaxLength(key==='message'?220:80).setValue(String(value)))));
 }
 diagnostic(s){return {version:require('../package.json').version,at:new Date().toISOString(),greetings:this.manager.greetings?.snapshot(),bots:this.ids(s).map(id=>{const w=this.manager.workers.get(id),b=w?.bot,p=b?.entity?.position;return {number:id,name:this.manager.names.get(id),mode:w?.mode,connectionPhase:b?.connectionPhase,runtimeEntityId:b?._runtimeEntityId?.toString(),position:p,serverPosition:b?.serverPosition,health:b?.health,dead:b?.dead,terrainReady:b?.terrainReady,feet:p?b.blockAt(p)?.name:null,below:p?b.blockAt(p.offset(0,-.1,0))?.name:null,knownSections:b?.worldMirror?.known.size,packets:b?.packetCounts,lastMove:b?.lastMovePacket,positionNormalization:b?.lastPositionNormalization,collisionState:b?.collisionState,runtime:w?.runtime?.snapshot(),debug:w?.runtime?.debug?.report(),inventoryMode:b?.inventoryMode,serverAuthoritativeInventory:b?.serverAuthoritativeInventory,inventoryOpenState:b?.inventoryOpenState,inventoryOpenRequests:b?.inventoryOpenRequests,pendingStack:b?.pendingStackRequest,lastStackResponse:b?.lastStackResponse,inventory:b?.list().map(i=>({slot:i.slot,name:i.name,count:i.count,networkId:i.raw.network_id,stackId:i.raw.stack_id})),serverMessages:(this.manager.logs.get(id)||[]).slice(-12)};})};}
 async handle(i){if(!i.customId?.startsWith(CID))return false;if(i.user.id!==this.owner){await i.reply({content:'このBotの管理者だけ操作できます。',flags:MessageFlags.Ephemeral});return true;}
  if(i.customId===CID+'open'){await i.deferReply({flags:MessageFlags.Ephemeral});await this.create(i);return true;}
  const modal=i.isModalSubmit?.(),parts=i.customId.slice(CID.length).split(':'),id=modal?parts[2]:i.message?.id,s=this.sessions.get(id);if(!s){await i.reply({content:'/panel をもう一度開いてください。',flags:MessageFlags.Ephemeral});return true;}s.updatedAt=Date.now();
  try{
   if(parts[0]==='form'){await i.showModal(this.modal(id,s,parts[1]));return true;}
   if(['auth','view','report','messages','enemy-list','admin-list','stats'].includes(parts[0])){await i.deferReply({flags:MessageFlags.Ephemeral});let result;
    if(parts[0]==='report'){await i.editReply({content:'停止理由・地形・直近の移動記録を含む状態レポートです。動かない操作を試した直後のファイルを確認してください。',files:[{attachment:Buffer.from(JSON.stringify(this.diagnostic(s),null,2)),name:'bot-report.json'}],allowedMentions:{parse:[]}});return true;}
    if(parts[0]==='view'){const ids=this.ids(s);if(ids.length!==1)throw Error('Botを1体選んでください');const b=this.manager.worker(ids[0]).bot,view=require('./view').renderView(b);await i.editReply({content:'受信地形から描いた視点です。',files:[{attachment:view.buffer,name:'bot-view.png'}]});return true;}
    if(parts[0]==='auth'){const ids=this.ids(s);if(ids.length!==1)throw Error('Botを1体選んでください');result=this.manager.authStatus(ids[0]);}
    else if(parts[0]==='admin-list')result=this.manager.store.data.admins.map(a=>`${a.name} / ${a.xuid}`).join('\n')||'登録なし';
    else result=await this.manager.execute(s.target,{'enemy-list':'enemy list',messages:'messages',stats:'stats'}[parts[0]]);
    await i.editReply({content:String(result).slice(0,1900),allowedMentions:{parse:[]}});return true;
   }
   if(modal){await i.deferReply({flags:MessageFlags.Ephemeral});s.result=await this.submit(s,parts[1],i.fields);await i.editReply({content:s.result.slice(0,1900),allowedMentions:{parse:[]}});return true;}
   await i.deferUpdate();s.result='';
   if(parts[0]==='target'){this.manager.targets(i.values[0]);s.target=i.values[0];}
   else if(parts[0]==='page'){if(!pages[parts[1]])throw Error('画面がありません');s.page=parts[1];}
   else if(parts[0]==='mode'){if(!['walk','dig','fly','jetpack'].includes(i.values[0]))throw Error('移動方法が不正です');s.mode=i.values[0];}
   else if(parts[0]==='dimension'){if(!['overworld','nether'].includes(i.values[0]))throw Error('世界が不正です');s.dimension=i.values[0];}
   else if(parts[0]==='inventory-mode')s.result=await this.manager.execute(s.target,`inventorymode ${i.values[0]}`);
   else if(parts[0]==='channel'){const channel=await i.guild.channels.fetch(i.values[0]);if(!channel?.isTextBased())throw Error('テキストチャンネルを選んでください');this.manager.store.data.logChannel=channel.id;this.manager.store.data.liveMessageId=null;this.manager.store.save();s.result='ログの通知先を設定しました';}
   else if(parts[0]==='toggle'){const key=parts[1];if(!['gear','autototem','autoslot','heal','killaura','anticrystal','autolog','crystalaura','pistoncrystal','jetpack'].includes(key))throw Error('設定が不正です');const on=!this.settings(s).every(c=>c[key]);s.result=await this.manager.execute(s.target,`${key} ${on?'on':'off'}`);}
   else if(parts[0]==='respawn')s.result=await this.manager.execute(s.target,`respawn ${this.ids(s).every(id=>this.manager.store.bot(id).respawn)?'off':'on'}`);
   else if(parts[0]==='live')s.result=await this.manager.execute(s.target,`log ${this.manager.store.data.liveLog?'off':'on'}`);
   else if(parts[0]!=='refresh'){const cmd={connect:'connect',disconnect:'disconnect',stop:'stop',receive:'autoslot receive',sort:'autoslot now','recover-box':'autoslot recover',start:'start','scaffold-receive':'scaffold receive',recover:'recover',escape:'escape','pvp-start':'pvp on','pvp-stop':'pvp off','greeter-status':'greeter status','greeter-test':'greeter test'}[parts[0]];if(!cmd)throw Error('操作がありません');s.result=await this.manager.execute(s.target,cmd);}
   await i.editReply(this.render(s));
  }catch(e){if(i.deferred||i.replied){if(modal||['auth','view','report','messages','enemy-list','admin-list','stats'].includes(parts[0]))await i.editReply({content:e.message.slice(0,1900),allowedMentions:{parse:[]}});else{s.result='操作できません: '+e.message;await i.editReply(this.render(s));}}else await i.reply({content:e.message.slice(0,1900),flags:MessageFlags.Ephemeral});}
  return true;
 }
 async submit(s,form,fields){const get=k=>fields.getTextInputValue(k).trim();if(form==='say')return this.manager.say(s.target,get('message'));if(form==='w')return this.manager.whisper(s.target,get('id'),get('message'));if(form==='move'){return this.manager.execute(s.target,`goto ${s.mode} ${s.dimension} ${get('x')} ${get('y')} ${get('z')}`);}
  if(form==='speed'){const h=Number(get('horizontal')),v=Number(get('vertical'));return this.manager.execute(s.target,`flyspeed ${h/20} ${v/20}`);}
  if(form==='enemy-add'||form==='enemy-remove')return this.manager.execute(s.target,`enemy ${form==='enemy-add'?'add':'remove'} ${get('name')}`);
  if(form==='admin-add'){const name=get('name'),profile=[...this.manager.workers.values()].flatMap(w=>[...w.bot.players.values()]).find(p=>norm(p.name)===norm(name)),xuid=get('xuid')||profile?.xuid;if(!xuid)throw Error('同じサーバーに本人がいる時に登録するか、XUIDを入力してください');if(profile&&profile.xuid!==xuid)throw Error('XUIDがプレイヤー一覧と一致しません');this.manager.store.adminAdd(name,xuid);return `${name} を登録しました`;}
  if(form==='admin-remove'){const name=get('name');this.manager.store.data.admins=this.manager.store.data.admins.filter(a=>norm(a.name)!==norm(name));this.manager.store.save();return `${name} の権限を解除しました`;}
  if(form==='autolog')return this.manager.execute(s.target,`autolog on ${get('hearts')}`);
  if(form==='depth')return this.manager.execute(s.target,`anticrystal ${get('depth')}`);
  if(form==='heal'){const n=Number(get('hearts'));if(!Number.isFinite(n)||n<=0||n>10)throw Error('ハート数は0より大きく10以下にしてください');for(const id of this.ids(s)){const state=this.manager.store.bot(id);state.runtime??={...defaults};state.runtime.healHearts=n;state.runtime.heal=true;}this.manager.store.save();return `${n}ハート以下で回復します`;}
  if(form==='area'){const coords=['x1','z1','x2','z2'].map(get),floor=get('floor');const {integer}=require('./util');coords.forEach(n=>integer(n,-30000000,30000000));integer(floor,-64,318);await this.manager.execute(s.target,`area ${coords.join(' ')}`);return this.manager.execute(s.target,`floor ${floor}`);}
  if(form==='scaffold')return this.manager.execute(s.target,`scaffold ${get('block')}`);throw Error('入力画面がありません');
 }
}
module.exports={ControlPanel};
