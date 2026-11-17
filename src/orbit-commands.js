'use strict';
const {SlashCommandBuilder}=require('discord.js');
function build(){return ['orbit','circle'].map(name=>new SlashCommandBuilder().setName(name).setDescription(name==='orbit'?'Playerか座標を中心にBotが周回（管理者専用）':'Playerか座標を中心にBotを円配置（管理者専用）')
 .addStringOption(o=>o.setName('server').setDescription('対象サーバー').setRequired(true).addChoices({name:'IGN',value:'ign'},{name:'2b2e',value:'2b2e'}))
 .addStringOption(o=>o.setName('action').setDescription('開始・停止').setRequired(true).addChoices({name:'開始',value:'start'},{name:'停止',value:'stop'}))
 .addStringOption(o=>o.setName('center').setDescription('中心の種類').addChoices({name:'プレイヤー',value:'Player'},{name:'座標',value:'Coordinates'}))
 .addStringOption(o=>o.setName('player').setDescription('中心プレイヤーのMCID').setMaxLength(64))
 .addNumberOption(o=>o.setName('x').setDescription('中心X').setMinValue(-30000000).setMaxValue(30000000))
 .addNumberOption(o=>o.setName('y').setDescription('中心Y').setMinValue(-64).setMaxValue(319))
 .addNumberOption(o=>o.setName('z').setDescription('中心Z').setMinValue(-30000000).setMaxValue(30000000))
 .addNumberOption(o=>o.setName('radius').setDescription('半径（ブロック）').setMinValue(.5).setMaxValue(32))
 .addNumberOption(o=>o.setName('speed').setDescription('周回速度（rad/s、標準0.5）').setMinValue(.1).setMaxValue(2))
 .addBooleanOption(o=>o.setName('jump').setDescription('ジャンプする'))
 .addStringOption(o=>o.setName('direction').setDescription('回転方向').addChoices({name:'時計回り',value:'Clockwise'},{name:'反時計回り',value:'Counterclockwise'})));
}
function run(manager,i){const o=i.options,action=o.getString('action',true),realm=o.getString('server',true),centerMode=o.getString('center')||'Player';const d={realm,action,name:o.getString('player')||'',radius:o.getNumber('radius')??3,centerMode,orbit:i.commandName==='orbit',speed:o.getNumber('speed')??.5,jump:o.getBoolean('jump')??false,direction:o.getString('direction')||'Clockwise',x:o.getNumber('x'),y:o.getNumber('y'),z:o.getNumber('z')};
 if(action==='start'&&centerMode==='Coordinates'&&![d.x,d.y,d.z].every(Number.isFinite))throw Error('座標中心にはx・y・zをすべて指定してください');
 require('./circle').configure(manager,d);
 return action==='stop'?realm+' の円配置・周回を停止しました':realm+' / '+(centerMode==='Coordinates'?d.x+', '+d.y+', '+d.z:d.name)+' 中心 / 半径 '+d.radius+' / '+(d.orbit?'周回':'円配置')+'を開始しました（対象検出・地形受信後に動作）';
}
module.exports={build,run};
