'use strict';
const crypto=require('node:crypto');
const {microsoftError}=require('./device-code-poll');
const REDIRECT='https://login.live.com/oauth20_desktop.srf';
function equal(a,b){const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));return x.length===y.length&&x.length>0&&crypto.timingSafeEqual(x,y);}
class BrowserSignIn{
 constructor(msa,{signal,onAccepted=()=>{},now=Date.now,fetchFn=(...args)=>fetch(...args)}={}){
  if(!msa?.clientId)throw Error('Microsoft browser sign-in requires a Live authentication client');
  this.msa=msa;this.signal=signal;this.onAccepted=onAccepted;this.now=now;this.fetch=fetchFn;this.status='waiting';
  this.id=crypto.randomBytes(32).toString('base64url');this.verifier=crypto.randomBytes(32).toString('base64url');this.expires=now()+600000;
  this.scope=Array.isArray(msa.scopes)?msa.scopes.join(' '):msa.scopes;
  const url=new URL('https://login.live.com/oauth20_authorize.srf');
  url.search=new URLSearchParams({client_id:msa.clientId,scope:this.scope,response_type:'code',redirect_uri:REDIRECT,state:this.id,code_challenge:crypto.createHash('sha256').update(this.verifier).digest('base64url'),code_challenge_method:'S256'}).toString();
  this.url=url.toString();this.promise=new Promise((resolve,reject)=>{this.resolve=resolve;this.reject=reject;});this.promise.catch(()=>{});
  this.abort=()=>this.cancel();signal?.addEventListener('abort',this.abort,{once:true});if(signal?.aborted)this.cancel();
 }
 snapshot(){return this.status==='waiting'?{id:this.id,url:this.url,expires:this.expires}:null;}
 cancel(){if(!['waiting','exchanging'].includes(this.status))return;this.status='cancelled';this.finish();this.reject(microsoftError('Microsoft browser sign-in',{error:'authorization_declined'}));}
 finish(){this.verifier='';this.signal?.removeEventListener('abort',this.abort);}
 complete(returnURL){
  let url;try{url=new URL(String(returnURL));}catch{throw Object.assign(Error('Invalid Microsoft return URL'),{status:400});}
  if(url.origin!=='https://login.live.com'||url.pathname!=='/oauth20_desktop.srf'||url.username||url.password||url.hash||url.searchParams.getAll('state').length!==1||url.searchParams.getAll('code').length>1||url.searchParams.getAll('error').length>1||!equal(url.searchParams.get('state'),this.id))throw Object.assign(Error('Microsoft sign-in state or callback did not match this attempt'),{status:403});
  const digest=crypto.createHash('sha256').update(url.href).digest('hex');
  if(this.exchange){if(this.returnDigest!==digest)throw Object.assign(Error('This browser sign-in already received a different response'),{status:409});return this.exchange;}
  if(this.status!=='waiting'||this.now()>=this.expires||this.signal?.aborted)throw Object.assign(Error('Microsoft browser sign-in expired or was cancelled'),{status:409});
  const code=url.searchParams.get('code'),providerError=url.searchParams.get('error');
  if(providerError&&code||!providerError&&(!code||code.length>8192))throw Object.assign(Error('Microsoft did not return an authorization code'),{status:400});
  this.status='exchanging';this.returnDigest=digest;
  this.exchange=(async()=>{
   try{
    if(providerError)throw microsoftError('Microsoft browser sign-in',{error:providerError,error_description:url.searchParams.get('error_description')||''});
    const signal=AbortSignal.any([this.signal,AbortSignal.timeout(20000)].filter(Boolean));
    const response=await this.fetch('https://login.live.com/oauth20_token.srf',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},body:new URLSearchParams({client_id:this.msa.clientId,scope:this.scope,grant_type:'authorization_code',code,redirect_uri:REDIRECT,code_verifier:this.verifier}).toString(),signal});
    let token;try{token=await response.json();}catch{throw microsoftError('Microsoft browser sign-in',{},response.status);}
    if(!response.ok||token?.error)throw microsoftError('Microsoft browser sign-in',token||{},response.status);
    if(typeof token?.access_token!=='string'||!token.access_token)throw microsoftError('Microsoft browser sign-in');
    this.signal?.throwIfAborted();if(this.status!=='exchanging')throw new DOMException('Sign-in cancelled','AbortError');
    await this.msa.updateCache(token);this.signal?.throwIfAborted();
    this.status='accepted';this.onAccepted();this.resolve({accessToken:token.access_token});return {accepted:true};
   }catch(error){if(this.status!=='cancelled'){this.status='failed';this.reject(error);}throw error;}finally{this.finish();}
  })();return this.exchange;
 }
}
module.exports={BrowserSignIn,REDIRECT};
