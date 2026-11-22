'use strict';
const {setTimeout:wait}=require('node:timers/promises');
// Patch this account's LiveTokenManager only; never share device codes or tokens.
function install(flow,{signal,onAccepted=()=>{},notify=()=>{},fetchFn=(...args)=>fetch(...args),sleep=(ms)=>wait(ms,undefined,{signal}),now=Date.now}={}){
 const msa=flow.msa;if(!msa||typeof msa.authDeviceCode!=='function'||!msa.clientId)return;
 msa.authDeviceCode=async callback=>{
  const {Endpoints}=require('prismarine-auth/src/common/Constants');
  const check=()=>{signal?.throwIfAborted();if(!msa.polling)throw new URIError('Microsoft sign-in cancelled');};
  const send=body=>({method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(body).toString(),signal});
  msa.polling=true;
  try{
   signal?.throwIfAborted();const response=await fetchFn(Endpoints.live.deviceCodeRequest,send({scope:msa.scopes,client_id:msa.clientId,response_type:'device_code'}));
   const code=await response.json();if(!response.ok||!code.device_code||!code.user_code)throw new URIError('Microsoft device-code request failed: HTTP '+response.status);
   const cookies=(response.headers.getSetCookie?.()||[response.headers.get('set-cookie')].filter(Boolean)).map(c=>c.split(';')[0]).join('; ');
   const expires=now()+Number(code.expires_in||900)*1000;let interval=Math.max(1000,Number(code.interval||5)*1000),networkFailures=0;
   callback(code);
   while(now()<expires){
    await sleep(interval);check();if(now()>=expires)break;
    let r;
    try{const request=send({client_id:msa.clientId,device_code:code.device_code,grant_type:'urn:ietf:params:oauth:grant-type:device_code'});if(cookies)request.headers.Cookie=cookies;r=await fetchFn(Endpoints.live.tokenRequest+'?client_id='+encodeURIComponent(msa.clientId),request);networkFailures=0;}
    catch(error){signal?.throwIfAborted();if(++networkFailures>=3)throw new URIError('Microsoft token polling failed: '+(error.code||error.name||'network error'));notify('Microsoft sign-in status: network retry '+networkFailures+'/3');continue;}
    check();const token=await r.json();
    if(token.error==='authorization_pending')continue;
    if(token.error==='slow_down'||r.status===429){interval=Math.min(30000,interval+5000);continue;}
    if(token.error)throw new URIError('Microsoft sign-in failed: '+String(token.error).replace(/[^a-zA-Z0-9_-]/g,'').slice(0,70));
    if(!r.ok||typeof token.access_token!=='string'||typeof token.refresh_token!=='string')throw new URIError('Microsoft token response invalid: HTTP '+r.status);
    check();await msa.updateCache(token);onAccepted();return {accessToken:token.access_token};
   }
   throw new URIError('Microsoft device code expired before the bot received approval. Start a fresh sign-in and use its current code.');
  }finally{msa.polling=false;}
 };
}
module.exports={install};
