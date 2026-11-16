'use strict';
function clean(value){return String(value??'').replace(/§[0-9a-z]/giu,'').replace(/[\u200B-\u200F\u202A-\u202E\uFEFF]/gu,'').normalize('NFKC').trim();}
function textOf(packet){let s=clean(packet.message);try{if(s.startsWith('{')){const j=JSON.parse(s);if(Array.isArray(j.rawtext))s=j.rawtext.map(t=>t.text||'').join('');else if(j.text)s=j.text;}}catch{}return clean(s);}
function publicChat(packet){const text=textOf(packet);
 if(['chat','whisper'].includes(packet.type)&&packet.source_name){const name=clean(packet.source_name),wrapped=parseLine(text);return {name,message:wrapped&&wrapped.name.toLowerCase()===name.toLowerCase()?wrapped.message:text};}
 if(packet.type==='translation'&&Array.isArray(packet.parameters)&&packet.parameters.length===2&&/^(?:chat\.type\.text|%chat\.type\.text)$/.test(text))return {name:clean(packet.parameters[0]),message:clean(packet.parameters[1])};
 return parseLine(text);
}
function parseLine(text){
 const angled=text.match(/^[<〈《＜]([^<>〈〉《》\r\n]+)[>〉》＞]\s*(.+)$/u);if(angled)return {name:clean(angled[1]),message:clean(angled[2])};
 const m=text.match(/^([^\r\n]+?)\s*[»›❯➤>]\s*(.+)$/u);return m?{name:clean(m[1]),message:clean(m[2])}:null;
}
// Parse AI questions separately; never reinterpret another player's quoted command.
function aiChat(packet){
 const direct=publicChat(packet),cmd=/^!ai(?:g)?(?=$|\s|[ぁ-んァ-ヶ一-龠？?@])/iu;
 if(direct&&cmd.test(direct.message)&&(!direct.name.startsWith('[')||packet.source_name))return direct;
 const raw=textOf(packet);const match=raw.match(/^(?:\[[^\]\r\n]{1,22}\]\s*)*(?:[<〈《]([^<>〈〉《》\r\n]{1,64})[>〉》]|([^:：»›❯➤|\r\n]{1,64}?)\s*(?:[:：»›❯➤|]))\s*(!ai.*)$/iu);
 if(!match||!cmd.test(match[3]))return null;
 const name=clean(match[1]||match[2]);if(packet.source_name&&clean(packet.source_name).toLowerCase()!==name.toLowerCase())return null;
 return {name,message:match[3]};
}
module.exports={clean,textOf,publicChat,aiChat};
