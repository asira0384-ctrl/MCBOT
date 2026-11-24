'use strict';
const {SlashCommandBuilder}=require('discord.js');
function build(){return [new SlashCommandBuilder().setName('desktop').setDescription('EXE / Nocturneのログイン・自分のパスワード再設定').addStringOption(o=>o.setName('action').setDescription('操作').setRequired(true).addChoices({name:'ログインリンクを発行',value:'login'},{name:'自分のパスワードを削除して再設定（確認）',value:'reset-password'}))];}
function run(manager,i){const web=manager.web;if(!web)throw Error('Webが起動していません');const id=String(i.user.id);if(!web.isAllowed(id))throw Error('利用許可がありません');
 if(i.options.getString('action',true)==='reset-password'){delete manager.store.data.desktopPasswords?.[id];manager.store.save();for(const s of web.sessions.values())if(String(s.discordId||s.owner)===id)delete s.desktopUnlocked;return '自分のデスクトップ用パスワードを削除しました。EXEからDiscord認証し、新しいパスワードを作成してください。';}
 const login=web.issueLogin(id,i.user.globalName||i.user.username,i.user);const url=login.url.replace('/#login=','/nocturne#login=');return '[Nocturneへログイン]('+url+')\nEXEにコードを入力する場合: '+login.code+'\n一度限り・2分間有効です。';}
module.exports={build,run};
