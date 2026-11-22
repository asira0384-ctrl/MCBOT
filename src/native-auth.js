'use strict';
const crypto=require('node:crypto');
const fail=(s,m)=>Object.assign(Error(m),{status:s}),hash=s=>crypto.createHash('sha256').update(String(s)).digest('hex');
function flows(w){w.nativeFlows??=new Map();for(let[id,f]of w.nativeFlows)if(f.expires<w.now())w.nativeFlows.delete(id);return w.nativeFlows}
function start(w,req){if(!w.base)throw fail(503,'Public web URL is not configured');let fs=flows(w),ip=w.ip(req);if(fs.size>=100||[...fs.values()].filter(f=>f.ip===ip).length>=5)throw fail(429,'Please wait before signing in again');let id=crypto.randomBytes(24).toString('base64url'),secret=crypto.randomBytes(32).toString('base64url');fs.set(id,{proof:hash(secret),ip,expires:w.now()+300000});return {id,secret,url:w.base+'/api/oauth/start?native='+id};}
function approve(w,s,d){if(s.discordOAuth!==true)throw fail(401,'Sign in with Discord again before approving this app.');let f=flows(w).get(String(d.id));if(!f)throw fail(410,'Authentication expired');if(!w.isAllowed(s.discordId||s.owner))throw fail(403,'Access is not permitted');if(f.user&&f.user.id!==w.publicProfile(s).id)throw fail(409,'This sign-in has already been approved');f.user=w.publicProfile(s);return {ok:true};}
function poll(w,req,res,d){const f=flows(w).get(String(d.id)),proof=Buffer.from(hash(d.secret),'hex');if(!f||!crypto.timingSafeEqual(proof,Buffer.from(f.proof,'hex')))throw fail(401,'Restart Discord authentication');if(!f.user)return {ok:true,pending:true};if(!w.isAllowed(f.user.id))throw fail(403,'Access has been revoked');
 if(!f.session){const s=w.createSession(req,res,f.user);s.discordOAuth=true;w.persistSessions();f.session=s;f.cookie=res.getHeader('Set-Cookie');}
 else if(f.cookie)res.setHeader('Set-Cookie',f.cookie);
 return {ok:true,pending:false,...require('./desktop-auth').status(w,f.session)};
}

module.exports={start,approve,poll,flows};
