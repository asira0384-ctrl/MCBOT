'use strict';
const {CURRENT_VERSION,Versions}=require('bedrock-protocol/src/options');
const {parsePublicKey,identityFromXuid,validateIdentity}=require('bedrock-protocol/src/auth/loginVerifier');
const {verifyOidcToken}=require('bedrock-protocol/src/handshake/oidc');

async function stage(name,scope,work){
 scope.onStage?.(name);scope.lastHttp=null;
 try{return await work();}catch(error){
  error.authStage??=scope.lastHttp?.stage||name;
  if(scope.lastHttp){error.authStatus??=scope.lastHttp.status;error.authHost??=scope.lastHttp.host;error.authPath??=scope.lastHttp.path;}
  throw error;
 }
}

// A completed device-code prompt proves Microsoft sign-in, not a Minecraft join.
// Verify the account here; obtain Minecraft credentials after server discovery.
async function verifyAccount(flow,scope={}){
 const auth=await stage('Xbox token',scope,()=>flow.getXboxToken('http://xboxlive.com'));
 return stage('Xbox profile',scope,async()=>{
  scope.signal?.throwIfAborted();
  const response=await fetch('https://profile.xboxlive.com/users/me/profile/settings?settings=Gamertag',{
   headers:{Authorization:`XBL3.0 x=${auth.userHash};${auth.XSTSToken}`,'x-xbl-contract-version':'2',Accept:'application/json'},signal:scope.signal
  });
  if(!response.ok)throw Object.assign(new Error('Xbox profile request failed'),{authStatus:response.status});
  const body=await response.json(),profile=body.profileUsers?.[0];
  const name=profile?.settings?.find(setting=>setting.id==='Gamertag')?.value,xuid=String(profile?.id||'');
  if(typeof name!=='string'||!name.trim()||!/^[1-9][0-9]{0,19}$/.test(xuid))throw Error('Xbox did not return a valid gamertag and XUID');
  if(auth.userXUID&&String(auth.userXUID)!==xuid)throw Error('Xbox profile does not match the signed-in account');
  return {name,xuid};
 });
}

function legacyProfile(chain){
 for(const token of chain||[]){
  let data;try{data=JSON.parse(Buffer.from(token.split('.')[1]||'','base64url')).extraData;}catch{continue;}
  if(!data?.displayName)continue;
  validateIdentity(data,true);
  return {name:data.displayName,uuid:data.identity,xuid:String(data.XUID)};
 }
 throw Error('Minecraft certificate did not contain an authenticated player profile');
}

async function login(flow,publicKey,version=CURRENT_VERSION,scope={},dependencies={}){
 const protocol=Versions[version];
 if(!protocol)throw Error('Unsupported Minecraft authentication version: '+version);
 if(protocol<944){
  const chain=await stage('Minecraft certificate',scope,()=>flow.getMinecraftBedrockChain(publicKey));
  return {chain,token:'',profile:legacyProfile(chain)};
 }
 // Modern servers authenticate the official OIDC token. A legacy certificate
 // request is neither necessary nor a prerequisite for this protocol.
 const token=await stage('Minecraft multiplayer token',scope,()=>flow.getMinecraftBedrockMultiplayerToken(publicKey,{version}));
 return stage('Minecraft token verification',scope,async()=>{
  if(typeof token!=='string'||!token)throw Error('Minecraft returned an empty multiplayer token');
  const normalized=token.replace(/^MCToken\s+/i,''),claims=await(dependencies.verifyToken||verifyOidcToken)(normalized,version);
  if(!Number.isInteger(claims.exp)||claims.exp<=Math.floor(Date.now()/1000)||typeof claims.iss!=='string'||!claims.iss)throw Error('Minecraft token is missing a valid issuer or expiry');
  const expected=parsePublicKey(publicKey),actual=parsePublicKey(claims.cpk||claims.clientPublicKey);
  if(!expected.export({type:'spki',format:'der'}).equals(actual.export({type:'spki',format:'der'})))throw Error('Minecraft multiplayer token belongs to another connection key');
  const xuid=String(claims.xid||claims.XUID||claims.xuid||''),identity={displayName:claims.xname||claims.displayName,XUID:xuid,identity:claims.leguuid||claims.identity||identityFromXuid(xuid)};
  validateIdentity(identity,true);
  return {chain:[],token:normalized,profile:{name:identity.displayName,uuid:identity.identity,xuid}};
 });
}

async function authenticate(client,options,scope={},dependencies={}){
 try{
  const {Titles}=require('prismarine-auth');
  const title=options.authTitle??options.authflow.options?.authTitle??Titles.MinecraftNintendoSwitch;
  const deviceOS=({[Titles.MinecraftAndroid]:1,[Titles.MinecraftIOS]:2,[Titles.MinecraftPlaystation]:11,[Titles.MinecraftNintendoSwitch]:12})[title];
  if(options.deviceOS===undefined){if(deviceOS===undefined)throw Object.assign(Error('The selected authentication platform needs a deviceOS'),{authStage:'Authentication platform'});options.deviceOS=deviceOS;}
  const result=await login(options.authflow,client.clientX509,options.version,scope,dependencies);
  if(client._closed||scope.signal?.aborted||scope.closed?.())return;
  const {norm}=require('../shared/util');
  if(scope.expectedName&&norm(result.profile.name)!==norm(scope.expectedName))throw Object.assign(new Error('Signed-in gamertag does not match the selected account'),{authStage:'Account match'});
  client.profile=result.profile;client.username=result.profile.name;
  client.accessToken=result.chain;client.multiplayerToken=result.token;
  client.emit('session',result.profile);
 }catch(error){if(!client._closed&&!scope.signal?.aborted&&!scope.closed?.())client.onConnectionError(error);}
}
module.exports={verifyAccount,login,authenticate,legacyProfile};
