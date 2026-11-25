'use strict';
function sent(bot,type,text,recipient,requestId){bot.lastChatDelivery={type,text,recipient:recipient||null,requestId:requestId||null,status:'sent',at:Date.now(),error:null};bot.emit?.('chatDelivery');}
function observe(bot,packet){const row=bot.lastChatDelivery;if(!row||Date.now()-row.at>15000)return;const text=String(packet.message||'');if(packet.source_name&&String(packet.source_name).toLowerCase()===String(bot.username).toLowerCase()&&text===row.text){row.status='echoed';row.confirmedAt=Date.now();bot.emit?.('chatDelivery');return;}
 if(packet.source_name||!['raw','system','translation','tip','popup'].includes(packet.type))return;
 if(/(?:chosen not to receive|blocked (?:your|private) messages|cannot send messages to this player)/i.test(text)&&row.type==='whisper'){row.status='rejected';row.error='相手がtellの受信を拒否しています。再送・Botの切り替えは行いません';}
 else if(/(?:you are (?:currently )?muted|you (?:have been|were) muted|refrain from spamming|sending messages too (?:fast|quickly))/i.test(text)){row.status='rejected';row.error='サーバーがチャットを制限しました。自動で再送しません';}else return;bot.emit?.('chatDelivery');
}
function output(bot,packet){const row=bot.lastChatDelivery;if(!row||row.type!=='whisper'||Date.now()-row.at>15000||packet.origin?.request_id!==row.requestId)return;row.status=Number(packet.success_count)>0?'accepted':'rejected';if(row.status==='rejected')row.error='サーバーがtellコマンドを受理しませんでした';bot.emit?.('chatDelivery');}
function snapshot(bot){const row=bot.lastChatDelivery;if(!row)return null;const {text,requestId,...publicRow}=row;return publicRow;}
module.exports={sent,observe,output,snapshot};
