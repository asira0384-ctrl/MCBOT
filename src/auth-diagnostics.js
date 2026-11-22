'use strict';
// Report the failing service, without guessing ownership from a generic 401.
function message(error){
 const raw=String(error?.message||error||'');
 if(error?.authOAuthCode){
  const code=error.authOAuthCode,status=error.authStatus?' HTTP '+error.authStatus:'',aadsts=error.authAADSTS?' / '+error.authAADSTS:'';
  const hints={expired_token:'This bot did not receive approval for its current code before expiry. Start Fresh Microsoft login.',authorization_declined:'Microsoft approval was declined. Start a new sign-in.',access_denied:'Microsoft approval was denied. Check the browser result.',invalid_grant:'This sign-in or saved token is no longer valid. Start Fresh Microsoft login.',bad_verification_code:'Microsoft did not recognize this device code. Start a new sign-in.',invalid_client:'Microsoft rejected the authentication client.',unauthorized_client:'Microsoft did not allow this authentication client.',invalid_scope:'Microsoft rejected the requested sign-in scope.',invalid_request:'Microsoft rejected the sign-in request.',network_error:'The bot could not reach Microsoft to check approval.',interaction_required:'A new Microsoft sign-in is required.',invalid_response:'Microsoft did not return a usable token response.'};
  if(code==='expired_token')return 'Microsoft approval: expired_token. '+hints[code];
  return (error.authStage||'Microsoft sign-in')+':'+status+' '+code+aadsts+'. '+(hints[code]||'Microsoft did not complete this sign-in. Check the browser result.');
 }
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
