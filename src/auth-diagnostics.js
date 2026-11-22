'use strict';
// Report the failing service, without guessing ownership from a generic 401.
function message(error){
 const raw=String(error?.message||error||'');
 if(error?.authStage){
  const stage=String(error.authStage),status=error.authStatus||raw.match(/\b(4\d\d|5\d\d)\b/)?.[1];
  const code=raw.match(/\b214891\d{4}\b/)?.[0];
  if(status||code)return `${stage}: ${status?'HTTP '+status:''}${code?' / Xbox '+code:''}. ${stage==='Minecraft certificate'?'The legacy Minecraft certificate request was rejected.':stage==='Microsoft sign-in'?'Microsoft did not issue the requested sign-in token.':stage==='Xbox token'?'Xbox did not issue the requested token.':stage==='Xbox profile'?'Xbox did not return the signed-in profile.':stage==='PlayFab sign-in'?'PlayFab did not accept the Xbox sign-in.':'The Minecraft service rejected this sign-in request.'}`;
  if(error.authHost)return `${stage}: connection to ${error.authHost} failed. ${require('./auth-network').codes(error).join(', ')||error.authFailure||'Network error'}`;
  return `${stage}: ${raw.replace(/(?:Bearer|MCToken|XBL3\.0)\s+[^\s]+/gi,'[redacted]').replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,'[redacted]').slice(0,260)}`;
 }
 if(/\b401\b/.test(raw)&&/multiplayer\/bedrock\/authentication|UNAUTHORIZED/i.test(raw)){
  return 'Minecraft sign-in: HTTP 401. The browser prompt completed, but a service rejected a later request. The failing service must be identified before choosing a fix.';
 }
 return null;
}
module.exports={message};
