'use strict';
const tracked=new Set(['player_auth_input','inventory_transaction','item_stack_request','player_action','move_player','subchunk_request']);
function validMotion(p){
 const valid=n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=3.4028234663852886e38;
 return !!p&&['position','delta'].every(k=>p[k]&&['x','y','z'].every(a=>valid(p[k][a])))&&['pitch','yaw','head_yaw'].every(k=>p[k]===undefined||valid(p[k]))&&['move_vector','analogue_move_vector'].every(k=>!p[k]||['x','y'].every(a=>valid(p[k][a])));
}
function remember(bot,name,p){
 if(!tracked.has(name)||bot.serverClosing||bot.ended)return;
 const row={name,at:Date.now(),tick:p.tick===undefined?null:String(p.tick),action:name==='inventory_transaction'?p.transaction?.transaction_data?.action_type:name==='player_action'?p.action:null,blockActions:name==='player_auth_input'?(p.block_action||[]).map(a=>a.action):undefined};
 bot.lastGameplayPacket=row;bot.recentGameplayPackets??=[];bot.recentGameplayPackets.push(row);if(bot.recentGameplayPackets.length>24)bot.recentGameplayPackets.shift();
}
function captureDisconnect(bot){
 if(!bot.disconnectPackets)bot.disconnectPackets={last:bot.lastGameplayPacket?structuredClone(bot.lastGameplayPacket):null,packets:structuredClone(bot.recentGameplayPackets||[]),issue:bot.lastPacketIssue||null};
 bot.serverClosing=true;return bot.disconnectPackets;
}
function exitPackets(bot){return bot.disconnectPackets||{last:bot.lastGameplayPacket||null,packets:bot.recentGameplayPackets||[],issue:bot.lastPacketIssue||null};}
function lastLabel(bot){const p=exitPackets(bot).last;if(!p)return '記録なし';const detail=p.action||(p.blockActions||[]).join(',');return p.name+(detail?' ('+detail+')':'');}
module.exports={validMotion,remember,captureDisconnect,exitPackets,lastLabel};
