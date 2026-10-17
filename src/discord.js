'use strict';
const {Client,GatewayIntentBits,REST,Routes,SlashCommandBuilder,MessageFlags}=require('discord.js');const {OWNER}=require('./store');const {norm}=require('./util');
const commands=[
 ...require('./coordinates').aliases.map(name=>new SlashCommandBuilder().setName(name).setDescription('Botの座標を確認（誰でも利用可能）').addStringOption(o=>o.setName('target').setDescription('Bot番号 / all（省略時1）'))),
 new SlashCommandBuilder().setName('say').setDescription('Botから公開チャットへ送信（管理者専用）').addStringOption(o=>o.setName('target').setDescription('Bot番号 / all').setRequired(true)).addStringOption(o=>o.setName('message').setDescription('送信するメッセージ').setMaxLength(220).setRequired(true)),
 new SlashCommandBuilder().setName('w').setDescription('Botからtellを送信（管理者専用）').addStringOption(o=>o.setName('target').setDescription('Bot番号 / all').setRequired(true)).addStringOption(o=>o.setName('id').setDescription('相手のゲーマータグ（空白対応）').setMaxLength(64).setRequired(true)).addStringOption(o=>o.setName('message').setDescription('送信するメッセージ').setMaxLength(220).setRequired(true)),
 new SlashCommandBuilder().setName('web').setDescription('Web管理画面に本人専用のリンクでログイン').addStringOption(o=>o.setName('url').setDescription('初回のみ: Railwayの公開URL（https://〜）')),
 new SlashCommandBuilder().setName('panel').setDescription('ボタンと選択メニューでBotを管理する（管理者専用）'),
 new SlashCommandBuilder().setName('bot').setDescription('Botを番号/allで操作する（管理者専用）').addStringOption(o=>o.setName('target').setDescription('1〜11 / all').setRequired(true)).addStringOption(o=>o.setName('command').setDescription('例: connect / start / stop / area -20 -20 20 20 / floor 64').setRequired(true)),
 new SlashCommandBuilder().setName('auth').setDescription('Microsoft認証を開始・コードを確認（管理者専用）').addIntegerOption(o=>o.setName('target').setDescription('Bot番号').setMinValue(1).setMaxValue(11).setRequired(true)),
 new SlashCommandBuilder().setName('admin').setDescription('ゲーム内操作権限を管理（管理者専用）')
 .addSubcommand(s=>s.setName('add').setDescription('MCIDを登録').addStringOption(o=>o.setName('mcid').setDescription('空白も含むゲーマータグ').setRequired(true)).addStringOption(o=>o.setName('xuid').setDescription('任意。接続中プレイヤー一覧から自動取得できない場合のみ')))
 .addSubcommand(s=>s.setName('remove').setDescription('登録を解除').addStringOption(o=>o.setName('mcid').setDescription('ゲーマータグ').setRequired(true)))
 .addSubcommand(s=>s.setName('list').setDescription('登録一覧')),
 new SlashCommandBuilder().setName('logchannel').setDescription('補給・切断通知のチャンネル（管理者専用）').addChannelOption(o=>o.setName('channel').setDescription('通知先').setRequired(true)),
 new SlashCommandBuilder().setName('webaccess').setDescription('Webの利用許可を管理（Asira専用）')
  .addSubcommand(v=>v.setName('add').setDescription('Webの利用を許可').addUserOption(o=>o.setName('user').setDescription('許可するユーザー').setRequired(true)))
  .addSubcommand(v=>v.setName('remove').setDescription('Webの利用許可を解除').addUserOption(o=>o.setName('user').setDescription('解除するユーザー').setRequired(true)))
  .addSubcommand(v=>v.setName('list').setDescription('利用許可の一覧')),
 new SlashCommandBuilder().setName('help').setDescription('操作ガイド（管理者専用）')
].map(c=>c.toJSON());
async function startDiscord(manager){const token=process.env.DISCORD_TOKEN;if(!token)throw Error('.envまたはRailway VariablesにDISCORD_TOKENを設定してください');const client=new Client({intents:[GatewayIntentBits.Guilds]});let logChain=Promise.resolve();
 const panel=new (require('./panel').ControlPanel)(manager,OWNER);
 manager.onNotice=(id,message)=>{console.log(`[Bot${id}] ${message}`);const channelId=manager.store.data.logChannel;if(!channelId)return;
  logChain=logChain.then(async()=>{const channel=await client.channels.fetch(channelId);if(channel?.isTextBased())await channel.send({content:`[Bot${String(id).padStart(2,'0')}] ${message}`,allowedMentions:{parse:[]}});}).catch(e=>console.error('通知送信失敗:',e.message));};
 client.once('clientReady',async()=>{if(manager.web)manager.web.oauthClientId=client.user.id;const {registerCommands,publishEntry}=require('./command-registration');const rest=new REST({version:'10'}).setToken(token);const results=await registerCommands(rest,client.user.id,commands,[process.env.DISCORD_GUILD_ID,...client.guilds.cache.keys()]);for(const result of results)console.log(result.ok?`コマンド登録済み: ${result.scope}`:`コマンド登録失敗: ${result.scope}: ${result.message}`);console.log(`Discord ready: v${require('../package.json').version} /panel /web /help`);try{await publishEntry(client,manager,panel);}catch(e){console.error('操作ボタンの配置失敗:',e.message);}});
 client.on('guildCreate',async guild=>{const rest=new REST({version:'10'}).setToken(token);const results=await require('./command-registration').registerCommands(rest,client.user.id,commands,[guild.id]);for(const result of results)if(!result.ok)console.error('コマンド登録失敗:',result.message);});
 client.on('interactionCreate',async i=>{if(!i.isChatInputCommand()){try{await panel.handle(i);}catch(e){console.error('管理パネル:',e.message);}return;}if(await require('./coordinates').discordCoordinates(i,manager))return;if(i.user.id!==OWNER&&!(i.commandName==='web'&&manager.web?.isAllowed(i.user.id))){await i.reply({content:'このBotに設定された管理者のみ使用できます。',flags:MessageFlags.Ephemeral});return;}await i.deferReply({flags:MessageFlags.Ephemeral});
  try{let result;
   switch(i.commandName){
    case 'webaccess':{const action=i.options.getSubcommand(),user=action==='list'?null:i.options.getUser('user',true);const list=require('./discord-login').grant(manager.store,i.user.id,action,user);result=action==='list'?(list.map(v=>`${v.name} / ${v.id}`).join('\n')||'Asira本人のみ利用できます'):action==='add'?`${user.username} (${user.id}) のWeb利用を許可しました`:`${user.username} (${user.id}) のWeb利用許可を解除しました`;manager.web?.pump();break;}
     case 'say':result=manager.say(i.options.getString('target',true),i.options.getString('message',true));break;
    case 'w':result=manager.whisper(i.options.getString('target',true),i.options.getString('id',true),i.options.getString('message',true));break;
    case 'web':{if(!manager.web)throw Error('Web管理に対応した版へ更新してください');const url=i.options.getString('url');if(url)manager.web.configureURL(i.user.id,url);await i.editReply(manager.web.loginMessage(i.user.id,i.user.globalName||i.user.username));return;}
    case 'panel':await panel.create(i);return;
    case 'bot':{const target=i.options.getString('target',true),command=i.options.getString('command',true).trim();
     if(command==='panel'||command==='gui'){await panel.create(i,target);return;}
     if(command==='view'){const ids=manager.targets(target);if(ids.length!==1)throw Error('view はBot番号を1つ指定してください');const id=ids[0],w=manager.workers.get(id);if(!w)throw Error('先にBotを接続してください');await i.editReply(require('./view').reply(w.bot,id));return;
     }result=await manager.execute(target,command);break;}

    case 'auth':{const id=i.options.getInteger('target',true);manager.login(id);result=manager.authStatus(id);break;}
    case 'admin':{const action=i.options.getSubcommand();if(action==='list'){result=manager.store.data.admins.map(a=>`${a.name} / XUID ${a.xuid}`).join('\n')||'登録なし';break;}
     const name=i.options.getString('mcid',true).trim();if(action==='remove'){manager.store.data.admins=manager.store.data.admins.filter(a=>norm(a.name)!==norm(name));manager.store.save();result=`${name} の権限を解除しました`;break;}
     const profile=[...manager.workers.values()].flatMap(w=>[...w.bot.players.values()]).find(p=>norm(p.name)===norm(name));const xuid=i.options.getString('xuid')||profile?.xuid;
     if(!xuid)throw Error('Bot接続後、登録する人も同じサーバーに入って再実行してください。XUIDを指定する方法も使えます');if(profile&&profile.xuid!==xuid)throw Error('プレイヤー一覧のXUIDと一致しません');manager.store.adminAdd(name,xuid);result=`${name} をゲーム内コマンドの管理者に登録しました`;break;}
    case 'logchannel':{const c=i.options.getChannel('channel',true);if(!c.isTextBased())throw Error('テキストチャンネルを指定');manager.store.data.logChannel=c.id;manager.store.data.liveMessageId=null;manager.store.save();result='補給・切断通知の送信先を設定しました。command:log on でリアルタイムログを有効にできます';break;}
    case 'help':result=`Bot v${require('../package.json').version} /web でWeb管理、/panel でDiscordのボタン操作ができます。/bot target:1 command:panel でも開けます。\n`+'① /auth target:1 → 認証を完了 → /bot target:1 command:connect\n② /admin add mcid:自分のゲーマータグ\n③ /bot target:1 command:area -20 -20 20 20\n④ /bot target:1 command:floor 64\n⑤ 装備と足場を渡す → /bot target:1 command:start\nゲーム内: !start 1 / !stop all / !stats all / !scaffold 1 receive\n視点画像: /bot target:1 command:view\n追加: follow MCID / follow off / autolog mode pop|empty|health|empty-health / autokit on kit名（11） / autotp on MCID（11） / autoback on（11） / friend add MCID / attackall on / assist on / feettrap on / restock request / account set MCID / drop 7 16 / swap 1 10 / bps / nearby / eat / drink / timer on 0.24 / predict 10 / autoslot receive / gear on / autototem on / enemy add MCID / killaura on / autolog on 3 / anticrystal 0.55\n移動: goto walk|dig|fly overworld|nether x y z / flyspeed 1.5 0.7\nWebの利用許可: /webaccess add user:@相手 / remove / list（Asira専用）。\n/logchannel → command:log on で5秒更新ログ。詳しくはCOMMANDS-JA.md。床Y以下は残します。';break;
   }const reply={content:String(result).slice(0,1950),allowedMentions:{parse:[]}};if(i.commandName==='help')reply.components=panel.entryMessage().components;await i.editReply(reply);
  }catch(e){await i.editReply({content:e.message.slice(0,1900),allowedMentions:{parse:[]}});}
 });require('./live-log').installLiveLog(client,manager);await client.login(token);return client;
}
module.exports={startDiscord,commands};
