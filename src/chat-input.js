'use strict';
function clean(value){return String(value??'').replace(/§[0-9a-z]/giu,'').replace(/[\u200B-\u200F\u202A-\u202E\uFEFF]/gu,'').normalize('NFKC').trim();}
function textOf(packet){let s=clean(packet.message);try{if(s.startsWith('{')){const j=JSON.parse(s);if(Array.isArray(j.rawtext))s=j.rawtext.map(t=>t.text||'').join('');else if(j.text)s=j.text;}}catch{}return clean(s);}
function publicChat(packet){const text=textOf(packet);
 if(['chat','whisper'].includes(packet.type)&&packet.source_name)return {name:clean(packet.source_name),message:text};
 if(packet.type==='translation'&&Array.isArray(packet.parameters)&&packet.parameters.length===2&&/^(?:chat\.type\.text|%chat\.type\.text)$/.test(text))return {name:clean(packet.parameters[0]),message:clean(packet.parameters[1])};
 const angled=text.match(/^<([^<>\r\n]+)>\s*(.+)$/u);if(angled)return {name:clean(angled[1]),message:clean(angled[2])};
 const m=text.match(/^([^\r\n]+?)\s*[»›❯➤>]\s*(.+)$/u);return m?{name:clean(m[1]),message:clean(m[2])}:null;
}
module.exports={clean,textOf,publicChat};
