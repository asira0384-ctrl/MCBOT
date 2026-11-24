'use strict';
function warning(packet){
 if(packet.source_name||!['raw','system','translation','tip','popup'].includes(packet.type))return null;
 const text=require('./chat-input').textOf(packet).replace(/^[»›❯>➤❤♥⚠]\s*/u,'');if(require('./chat-input').publicChat({...packet,message:text}))return null;
 if(!/^(?:please\b|you\b|refrain\b|don'?t\b|do not\b|slow\b|anti[- ]?spam\b|spam\b|スパム|連投)/iu.test(text))return null;
 if(!/spam|muted|sending messages too|too many messages|スパム|連投|ミュート/iu.test(text))return null;
 return {message:text.slice(0,300),muted:/muted|ミュート/iu.test(text)};
}
module.exports={warning};
