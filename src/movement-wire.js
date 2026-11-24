'use strict';
const {adaptInput,legacyMove}=require('./protocol'),safety=require('./packet-safety');
function mode(bot){if(bot.movementMode==='both')return 'both';return bot.advertisedMovement==='client'||bot.advertisedMovement===0?'legacy':'auth-input';}
function send(bot,raw,queue){
 if(!bot.registry)return;
 if(!safety.validMotion(raw)){bot.halt();bot.lastPacketIssue='不正な移動数値を検出したため送信を停止しました';bot.emit('diagnostic',bot.lastPacketIssue);return;}
 const data=adaptInput(bot,raw),selected=mode(bot);bot.lastMovementWire=selected;
 if(selected!=='auth-input'){const p=legacyMove(bot,data);safety.remember(bot,'move_player',p);queue('move_player',p);bot.sentLegacyMoves++;}
 if(selected!=='legacy'){safety.remember(bot,'player_auth_input',data);queue('player_auth_input',data);bot.sentInputs++;}
 bot.lastInputYaw=data.yaw*Math.PI/180;
}
module.exports={mode,send};
