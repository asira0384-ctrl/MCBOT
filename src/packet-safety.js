'use strict';
const tracked=new Set(['player_auth_input','inventory_transaction','item_stack_request','player_action','move_player','subchunk_request']);
const vector=p=>p?Object.fromEntries(['x','y','z'].map(k=>[k,p[k]])):undefined;
const pick=(p,keys)=>p?Object.fromEntries(keys.filter(k=>p[k]!==undefined).map(k=>[k,p[k]])):undefined;
function stackRequest(p){return p?{id:p.request_id,actions:(p.actions||[]).slice(0,8).map(a=>pick(a,['type_id','legacy_type_id','hotbar_slot','predicted_durability','network_id']))}:undefined;}
function validMotion(p){
 const valid=n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=3.4028234663852886e38;
 return !!p&&['position','delta'].every(k=>p[k]&&['x','y','z'].every(a=>valid(p[k][a])))&&['pitch','yaw','head_yaw'].every(k=>p[k]===undefined||valid(p[k]))&&['move_vector','analogue_move_vector'].every(k=>!p[k]||['x','y'].every(a=>valid(p[k][a])));
}
function remember(bot,name,p){
 if(!tracked.has(name)||bot.serverClosing||bot.ended)return;
 const row={name,at:Date.now(),tick:p.tick===undefined?null:String(p.tick),action:name==='inventory_transaction'?p.transaction?.transaction_data?.action_type:name==='player_action'?p.action:null,blockActions:name==='player_auth_input'?(p.block_action||[]).map(a=>a.action):undefined};
 if(name==='subchunk_request')row.subchunk={dimension:p.dimension,origin:vector(p.origin),offsets:(p.requests||[]).slice(0,64).map(r=>({x:r.x??r.dx,y:r.y??r.dy,z:r.z??r.dz}))};
 if(name==='player_auth_input'&&p.block_action?.some(a=>a.action!=='continue_break'&&a.action!=='crack_break'))row.blockTargets=p.block_action.slice(0,8).map(a=>({action:a.action,position:vector(a.position),face:a.face}));
 if(p.item_stack_request)row.stackRequest=stackRequest(p.item_stack_request);
 if(name==='item_stack_request')row.stackRequest=(p.requests||[]).slice(0,8).map(stackRequest);
 bot.lastRequestPackets??={};if(row.subchunk)bot.lastRequestPackets.subchunk=row;if(p.block_action?.some(a=>a.action==='predict_break'))bot.lastRequestPackets.miningPrediction=row;if(name==='item_stack_request')bot.lastRequestPackets.inventory=row;
 bot.lastGameplayPacket=row;bot.recentGameplayPackets??=[];bot.recentGameplayPackets.push(row);if(bot.recentGameplayPackets.length>24)bot.recentGameplayPackets.shift();
}
function captureDisconnect(bot){
 if(!bot.disconnectPackets)bot.disconnectPackets={last:bot.lastGameplayPacket?structuredClone(bot.lastGameplayPacket):null,packets:structuredClone(bot.recentGameplayPackets||[]),issue:bot.lastPacketIssue||null,requests:structuredClone(bot.lastRequestPackets||{}),evidence:structuredClone({at:Date.now(),protocol:bot.client?.options?.version,position:vector(bot.entity?.position),health:bot.health,dimension:bot.dimensionId,movement:bot.lastMovementWire,terrain:{lastColumn:bot.worldMirror?.lastColumn,requestableColumns:bot.worldMirror?.subchunkColumns?.size,skippedRequest:bot.worldMirror?.lastRequestSkipped},dig:pick(bot.digState,['phase','name','position','face','mode','at','breakMs','elapsedMs','remainingMs','predictedAt','confirmed','error'])})};
 bot.serverClosing=true;return bot.disconnectPackets;
}
function exitPackets(bot){return bot.disconnectPackets||{last:bot.lastGameplayPacket||null,packets:bot.recentGameplayPackets||[],issue:bot.lastPacketIssue||null,requests:bot.lastRequestPackets||{}};}
function lastLabel(bot){const p=exitPackets(bot).last;if(!p)return '記録なし';const detail=p.action||(p.blockActions||[]).join(',');return p.name+(detail?' ('+detail+')':'');}
module.exports={validMotion,remember,captureDisconnect,exitPackets,lastLabel};
