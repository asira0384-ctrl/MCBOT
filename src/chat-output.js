'use strict';
const {randomInt,randomUUID}=require('node:crypto');
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
function randomTag(){return Array.from({length:10},()=>alphabet[randomInt(alphabet.length)]).join('');}
function name(value){const s=String(value||'').trim();if(!s||s.length>64||/[\r\n\0"'\\/@§]/u.test(s))throw Error('有効なゲーマータグを指定してください（空白は使えます）');return s;}
function message(value){const s=String(value||'');if(!s.trim()||s.length>220||/[\r\n\0]/u.test(s))throw Error('メッセージを1〜220文字、1行で指定してください');return s;}
function automatic(text,recipient){const prefix=recipient?`@${name(recipient)} | `:'';const tail=` | ${randomTag()}`;const room=220-prefix.length-tail.length;let body='';for(const char of String(text)){if(body.length+char.length>room)break;body+=char;}return prefix+body+tail;}
// New Text packets dispatch their body by category. Missing category encodes
// message_only (0), making a native peer read source_name as the message.
function publicPacket(bot,text){return {type:'chat',category:'authored',needs_translation:false,source_name:bot.username,message:String(text).slice(0,220),xuid:'',platform_chat_id:'',has_filtered_message:false,filtered_message:''};}
function whisperPacket(bot,recipient,text){const id=name(recipient),msg=message(text),protocol=bot.registry.protocol.types,versionType=protocol.packet_command_request[1].find(f=>f.name==='version')?.type;
 return {command:`/tell "${id}" ${msg}`,origin:{type:'player',uuid:randomUUID(),request_id:randomUUID(),player_entity_id:BigInt(bot.client.startGameData?.entity_id||0)},internal:false,version:versionType==='string'?bot.client.options.version:0};
}
function parseTell(text){const m=String(text).match(/^\s*(?:w|tell)\s+(?:"([^"\r\n]+)"|'([^'\r\n]+)'|([^\s]+))\s+(.+)$/u);if(!m)throw Error('w "空白入りゲーマータグ" メッセージ');return {recipient:name(m[1]||m[2]||m[3]),text:message(m[4])};}
module.exports={randomTag,name,message,automatic,publicPacket,whisperPacket,parseTell};
