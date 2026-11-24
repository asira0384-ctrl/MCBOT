'use strict';

// A support report is an allowlist of operational state, not a settings backup.
// Never traverse the account/authentication objects or include raw packet bytes.
function clean(value,depth=0){
 if(depth>10)return '[truncated]';
 if(typeof value==='bigint')return String(value);
 if(typeof value==='string')return value.slice(0,2000)
  .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[email redacted]')
  .replace(/\b(?:Bearer|MCToken|XBL3\.0)\s+\S+/gi,'[credential redacted]')
  .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,'[token redacted]')
  .replace(/\b(?:password|secret|token|cookie|authorization|code)\s*[:=]\s*[^\s,;]+/gi,'[credential redacted]');
 if(Array.isArray(value))return value.slice(0,100).map(v=>clean(v,depth+1));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>!/(password|secret|token|cookie|authorization|email|authflow|device.?code|refresh)/i.test(k)).map(([k,v])=>[k,clean(v,depth+1)]));
 return value;
}
function packets(rows){return (rows||[]).slice(-24).map(p=>({name:p.name,at:p.at,tick:p.tick,action:p.action,blockActions:p.blockActions}));}
function report(manager,ids){
 const rows=[...new Set(ids)].slice(0,70).map(id=>{
  const s=manager.store.bot(id),w=manager.workers.get(id),b=w?.bot,exit=b?require('./packet-safety').exitPackets(b):null;
  return clean({id,name:manager.names.get(id),server:s.serverRealm,connected:!!b?.connected,mode:w?.mode||'disconnected',nukeEnabled:!!s.nukeEnabled,running:!!w?.running,
   position:b?.entity?.position,health:b?.health,dimension:b?.dimensionId,protocol:b?.client?.options?.version,movement:b?{advertised:b.advertisedMovement,selected:b.lastMovementWire,sentInputs:b.sentInputs,sentLegacyMoves:b.sentLegacyMoves}:null,
   mining:{area:s.area,floor:s.floor,ceiling:s.ceiling,range:s.miningRange,scaffold:s.scaffoldEnabled!==false,maxDrop:s.maxDrop,filter:s.miningFilter,status:w?.miningStatus?.(),totals:s.stats,sessionTotals:s.session},
   connection:manager.connectionKeeper?.snapshot(id),lastExit:s.lastConnectionExit?{kind:s.lastConnectionExit.kind,reason:s.lastConnectionExit.reason,at:s.lastConnectionExit.at,packets:packets(s.lastConnectionExit.packets),packetIssue:s.lastConnectionExit.packetIssue}:null,
   packets:packets(exit?.packets),packetIssue:exit?.issue,rejectedBlockActions:b?.rejectedBlockActions||0,runtimeErrors:w?.runtime?.featureErrors});
 });
 return {format:'asira-debug-v1',build:'7.10',generatedAt:new Date().toISOString(),summary:{selected:rows.length,connected:rows.filter(r=>r.connected).length,mining:rows.filter(r=>r.running).length},bots:rows};
}
module.exports={report,clean};
