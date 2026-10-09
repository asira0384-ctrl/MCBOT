'use strict';
const {Client,GatewayIntentBits,REST,Routes,SlashCommandBuilder,MessageFlags}=require('discord.js');const {OWNER}=require('./store');const {norm}=require('./util');
const commands=[
 new SlashCommandBuilder().setName('bot').setDescription('Botを番号/allで操作する（Asira専用）').addStringOption(o=>o.setName('target').setDescription('1〜10 / all').setRequired(true)).addStringOption(o=>o.setName('command').setDescription('例: connect / start / stop / area -20 -20 20 20 / floor 64').setRequired(true)),
 new SlashCommandBuilder().setName('auth').setDescription('Microsoft認証コードを見る（Asira専用）').addIntegerOption(o=>o.setName('target').setDescription('Bot番号').setMinValue(1).setMaxValue(10).setRequired(true)),
 new SlashCommandBuilder().setName('admin').setDescription('ゲーム内操作権限を管理（Asira専用）')
 .addSubcommand(s=>s.setName('add').setDescription('MCIDを登録').addStringOption(o=>o.setName('mcid').setDescription('空白も含むゲーマータグ').setRequired(true)).addStringOption(o=>o.setName('xuid').setDescription('任意。接続中プレイヤー一覧から自動取得できない場合のみ')))
 .addSubcommand(s=>s.setName('remove').setDescription('登録を解除').addStringOption(o=>o.setName('mcid').setDescription('ゲーマータグ').setRequired(true)))
 .addSubcommand(s=>s.setName('list').setDescription('登録一覧')),
 new SlashCommandBuilder().setName('logchannel').setDescription('補給・切断通知のチャンネル（Asira専用）').addChannelOption(o=>o.setName('channel').setDescription('通知先').setRequired(true)),
 new SlashCommandBuilder().setName('help').setDescription('操作ガイド（Asira専用）')
].map(c=>c.toJSON());
async function startDiscord(manager){const token=process.env.DISCORD_TOKEN;if(!token)throw Error('Railway VariablesにDISCORD_TOKENを設定してください');const client=new Client({intents:[GatewayIntentBits.Guilds]});let logChain=Promise.resolve();
 manager.onNotice=(id,message)=>{console.log(`[Bot${id}] ${message}`);const channelId=manager.store.data.logChannel;if(!channelId)return;
  logChain=logChain.then(async()=>{const channel=await client.channels.fetch(channelId);if(channel?.isTextBased())await channel.send({content:`[Bot${String(id).padStart(2,'0')}] ${message}`,allowedMentions:{parse:[]}});}).catch(e=>console.error('通知送信失敗:',e.message));};
 client.once('clientReady',async()=>{try{const rest=new REST({version:'10'}).setToken(token);const guild=process.env.DISCORD_GUILD_ID;await rest.put(guild?Routes.applicationGuildCommands(client.user.id,guild):Routes.applicationCommands(client.user.id),{body:commands});console.log('Discord ready: /help');}catch(e){console.error('コマンド登録失敗:',e.message);}});
 client.on('interactionCreate',async i=>{if(!i.isChatInputCommand())return;if(i.user.id!==OWNER){await i.reply({content:'Asira専用です。',flags:MessageFlags.Ephemeral});return;}await i.deferReply({flags:MessageFlags.Ephemeral});
  try{let result;
   switch(i.commandName){
    case 'bot':{const target=i.options.getString('target',true),command=i.options.getString('command',true).trim();
     if(command==='view'){const ids=manager.targets(target);if(ids.length!==1)throw Error('view はBot番号を1つ指定してください');const id=ids[0],w=manager.workers.get(id);if(!w)throw Error('先にBotを接続してください');const view=require('./view').renderView(w.bot),status=w.status();
      const messages=(manager.logs.get(id)||[]).slice(-5).join('\n');const content=`Bot${id} / v${require('../package.json').version} / ${w.bot.username}\n受信地形から描いたBot視点（マイクラ本体の画面ではありません）\n紫の格子＝未受信・判別できない地形。空の色＝受信済みの空気。UI・プレイヤーは描画しません。\n座標: ${JSON.stringify(status.position)}\nサーバー位置: ${JSON.stringify(status.serverPosition)}\n待機物理: ${status.passivePhysics} / 補正: ${status.positionCorrections}\n描画: ${JSON.stringify(view.hits)}\n${messages}`;
      await i.editReply({content:content.slice(0,1950),files:[{attachment:view.buffer,name:`bot-${id}-view.png`}],allowedMentions:{parse:[]}});return;
     }result=await manager.execute(target,command);break;}

    case 'auth':result=manager.authStatus(i.options.getInteger('target',true));break;
    case 'admin':{const action=i.options.getSubcommand();if(action==='list'){result=manager.store.data.admins.map(a=>`${a.name} / XUID ${a.xuid}`).join('\n')||'登録なし';break;}
     const name=i.options.getString('mcid',true).trim();if(action==='remove'){manager.store.data.admins=manager.store.data.admins.filter(a=>norm(a.name)!==norm(name));manager.store.save();result=`${name} の権限を解除しました`;break;}
     const profile=[...manager.workers.values()].flatMap(w=>[...w.bot.players.values()]).find(p=>norm(p.name)===norm(name));const xuid=i.options.getString('xuid')||profile?.xuid;
     if(!xuid)throw Error('Bot接続後、登録する人も同じサーバーに入って再実行してください。XUIDを指定する方法も使えます');if(profile&&profile.xuid!==xuid)throw Error('プレイヤー一覧のXUIDと一致しません');manager.store.adminAdd(name,xuid);result=`${name} をゲーム内コマンドの管理者に登録しました`;break;}
    case 'logchannel':{const c=i.options.getChannel('channel',true);if(!c.isTextBased())throw Error('テキストチャンネルを指定');manager.store.data.logChannel=c.id;manager.store.save();result='補給・切断通知の送信先を設定しました';break;}
    case 'help':result='① /bot target:1 command:connect → /auth target:1\n② /admin add mcid:自分のゲーマータグ\n③ /bot target:1 command:area -20 -20 20 20\n④ /bot target:1 command:floor 64\n⑤ 装備と足場を渡す → /bot target:1 command:start\nゲーム内: !start 1 / !stop all / !stats all / !scaffold 1 receive\n視点画像: /bot target:1 command:view\n設定・ログイン・採掘は別操作です。床Y以下は残します。足場回収は採掘数に含みません。';break;
   }await i.editReply({content:String(result).slice(0,1950),allowedMentions:{parse:[]}});
  }catch(e){await i.editReply({content:e.message.slice(0,1900),allowedMentions:{parse:[]}});}
 });await client.login(token);return client;
}
module.exports={startDiscord,commands};
