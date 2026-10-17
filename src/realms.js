'use strict';
function selected(store,id){const value=(typeof store?.bot==='function'?store.bot(id):store?.data?.bots?.[id])?.serverRealm;return value==='ign'||value==='2b2e'?value:id===11?'ign':'2b2e';}
function realm(runtime){return runtime.bot?.config?.realm||selected(runtime.manager?.store,runtime.worker?.id??runtime.bot?.config?.id??1);}
function isIgn(runtime){return realm(runtime)==='ign';}
function endpoint(store,id,env=process.env){const name=selected(store,id),ign=name==='ign',host=(ign?env.IGN_HOST:env.MC_HOST)?.trim()||(ign?'':'2b2e.org');if(!host)throw Error('IGN_HOSTにIGNの統合版サーバーIPを設定してください');return {realm:name,host,port:Number((ign?env.IGN_PORT:env.MC_PORT)||19132)};}
module.exports={selected,realm,isIgn,endpoint};
