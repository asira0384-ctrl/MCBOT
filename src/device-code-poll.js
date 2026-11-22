'use strict';
const {setTimeout:wait}=require('node:timers/promises');
const interactionErrors=new Set(['invalid_grant','invalid_refresh_token','interaction_required','login_required','consent_required']);
function microsoftError(stage,body={},status){
 const value=typeof body.error==='string'?body.error:body.error?.code;
 const code=typeof value==='string'&&/^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/.test(value)?value:'invalid_response';
 const error=new URIError(stage+': '+code);error.authStage=stage;error.authOAuthCode=code;
 if(Number(status)>=400)error.authStatus=Number(status);
 const aadsts=String(body.error_description||'').match(/\bAADSTS[0-9]{4,12}\b/)?.[0];
 if(aadsts)error.authAADSTS=aadsts;
 return error;
}
async function json(response,stage){
 try{const value=await response.json();if(!value||typeof value!=='object'||Array.isArray(value))throw Error();return value;}catch{throw microsoftError(stage,{},response.status);}
}
// Patch this account's LiveTokenManager only; never share codes or credentials.
function install(flow,{signal,onAccepted=()=>{},onState=()=>{},notify=()=>{},fetchFn=(...args)=>fetch(...args),sleep=ms=>wait(ms,undefined,{signal}),now=Date.now}={}){
 const msa=flow?.msa;if(!msa||typeof msa.authDeviceCode!=='function'||!msa.clientId)return;
 const {Endpoints}=require('prismarine-auth/src/common/Constants');
 const scopes=Array.isArray(msa.scopes)?msa.scopes.join(' '):msa.scopes;
 const send=body=>({method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(body).toString(),signal});
 const active=()=>signal?.throwIfAborted();
 // OAuth expires_in is seconds. The upstream Live manager adds it to a
 // millisecond timestamp, incorrectly expiring an hour-long token in seconds.
 if(typeof msa.cache?.getCached==='function'){
  msa.getAccessToken=async()=>{
   const {token}=await msa.cache.getCached();if(!token?.access_token)return;
   const until=Number(token.obtainedOn)+Number(token.expires_in)*1000-now();
   return {token:token.access_token,until,valid:Number.isFinite(until)&&until>1000};
  };
  msa.getRefreshToken=async()=>{const {token}=await msa.cache.getCached();return token?.refresh_token?{token:token.refresh_token}:undefined;};
  let refreshPromise;
  msa.refreshTokens=()=>{
   if(refreshPromise)return refreshPromise;
   refreshPromise=(async()=>{
    active();onState('refreshing');const old=await msa.getRefreshToken();
    if(!old)throw microsoftError('Microsoft token refresh',{error:'interaction_required'});
    const response=await fetchFn(Endpoints.live.tokenRequest,send({scope:scopes,client_id:msa.clientId,grant_type:'refresh_token',refresh_token:old.token}));
    const token=await json(response,'Microsoft token refresh');active();
    if(!response.ok||token.error)throw microsoftError('Microsoft token refresh',token,response.status);
    if(typeof token.access_token!=='string'||!token.access_token||!Number.isFinite(Number(token.expires_in))||Number(token.expires_in)<=0)throw microsoftError('Microsoft token refresh');
    if(token.refresh_token!==undefined&&typeof token.refresh_token!=='string')throw microsoftError('Microsoft token refresh');
    token.refresh_token=token.refresh_token||old.token;
    await msa.updateCache(token);active();onAccepted();return token;
   })().finally(()=>{refreshPromise=null;});
   return refreshPromise;
  };
  msa.verifyTokens=async()=>{
   active();const access=await msa.getAccessToken(),force=!!msa.forceRefresh;msa.forceRefresh=false;
   if(!force&&access?.valid)return true;
   if(!await msa.getRefreshToken())return false;
   try{await msa.refreshTokens();return true;}catch(error){
    active();
    if(error.authStage!=='Microsoft token refresh'||!interactionErrors.has(error.authOAuthCode))throw error;
    // A revoked refresh token needs interactive approval. Clear only this
    // account's invalid Microsoft entry, retaining every other account.
    await msa.cache.setCachedPartial({token:null});onState('renewing');return false;
   }
  };
 }
 msa.authDeviceCode=async callback=>{
  const check=()=>{active();if(!msa.polling)throw new URIError('Microsoft sign-in cancelled');};
  msa.polling=true;
  try{
   active();onState('requesting');
   const response=await fetchFn(Endpoints.live.deviceCodeRequest,send({scope:scopes,client_id:msa.clientId,response_type:'device_code'}));
   const code=await json(response,'Microsoft device code');active();
   if(!response.ok||!code.device_code||!code.user_code)throw microsoftError('Microsoft device code',code,response.status);
   const cookies=(response.headers.getSetCookie?.()||[response.headers.get('set-cookie')].filter(Boolean)).map(c=>c.split(';')[0]).join('; ');
   const expires=now()+Number(code.expires_in||900)*1000;
   let interval=Math.max(1000,Number(code.interval||5)*1000),networkFailures=0,polls=0;
   callback(code);onState('waiting',{expires});
   while(now()<expires){
    await sleep(Math.min(interval,expires-now()));check();if(now()>=expires)break;
    let r;
    try{
     const request=send({client_id:msa.clientId,device_code:code.device_code,grant_type:'urn:ietf:params:oauth:grant-type:device_code'});
     if(cookies)request.headers.Cookie=cookies;
     r=await fetchFn(Endpoints.live.tokenRequest+'?client_id='+encodeURIComponent(msa.clientId),request);networkFailures=0;
    }catch(error){
     active();if(++networkFailures>=3){const failure=microsoftError('Microsoft device polling',{error:'network_error'});failure.cause=error;throw failure;}
     notify('Microsoft approval: network retry '+networkFailures+'/3');continue;
    }
    check();const token=await json(r,'Microsoft device polling');polls++;
    if(token.error==='authorization_pending'){onState('pending',{polls,at:now(),expires});continue;}
    if(token.error==='slow_down'||r.status===429){
     const retryAfter=r.headers.get('retry-after'),retrySeconds=Number(retryAfter);
     const retryMs=retryAfter?(Number.isFinite(retrySeconds)?retrySeconds*1000:Date.parse(retryAfter)-now()):0;
     interval=Math.max(interval+5000,Number.isFinite(retryMs)?retryMs:0);onState('pending',{polls,at:now(),expires});continue;
    }
    if(token.error||!r.ok)throw microsoftError('Microsoft device approval',token,r.status);
    if(typeof token.access_token!=='string'||!token.access_token)throw microsoftError('Microsoft device approval',{},r.status);
    // OAuth may approve a session without issuing a refresh token. Its access
    // token can still authenticate this session; do not pretend it is persistent.
    if(token.refresh_token!==undefined&&(typeof token.refresh_token!=='string'||!token.refresh_token))delete token.refresh_token;
    check();await msa.updateCache(token);check();onAccepted();return {accessToken:token.access_token};
   }
   throw microsoftError('Microsoft device approval',{error:'expired_token'});
  }finally{msa.polling=false;}
 };
}
module.exports={install,microsoftError};
