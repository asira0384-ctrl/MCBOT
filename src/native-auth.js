'use strict';
const crypto=require('node:crypto');
const fail=(s,m)=>Object.assign(Error(m),{status:s}),hash=s=>crypto.createHash('sha256').update(String(s)).digest('hex');
function flows(w){w.nativeFlows??=new Map();for(let[id,f]of w.nativeFlows)if(f.expires<w.now())w.nativeFlows.delete(id);return w.nativeFlows}
function start(w,req){if(!w.base)throw fail(503,'公開Web URLが未設定です');let fs=flows(w),ip=w.ip(req);if(fs.size>=100||[...fs.values()].filter(f=>f.ip===ip).length>=5)throw fail(429,'少し待ってログインしてください');let id=crypto.randomBytes(24).toString('base64url'),secret=crypto.randomBytes(32).toString('base64url');fs.set(id,{proof:hash(secret),ip,expires:w.now()+300000});return {id,secret,url:w.base+'/api/oauth/start?native='+id};}
function approve(w,s,d){let f=flows(w).get(String(d.id));if(!f)throw fail(410,'認証の期限が切れました');if(!w.isAllowed(s.discordId||s.owner))throw fail(403,'利用許可がありません');if(f.user&&f.user.id!==w.publicProfile(s).id)throw fail(409,'この認証は確認済みです');f.user=w.publicProfile(s);return {ok:true};}
function poll(w,req,res,d){let fs=flows(w),f=fs.get(String(d.id)),proof=Buffer.from(hash(d.secret),'hex');if(!f||!crypto.timingSafeEqual(proof,Buffer.from(f.proof,'hex')))throw fail(401,'認証を開始し直してください');if(!f.user)return {ok:true,pending:true};if(!w.isAllowed(f.user.id))throw fail(403,'利用許可が解除されました');fs.delete(String(d.id));const s=w.createSession(req,res,f.user);return {ok:true,pending:false,csrf:s.csrf};}
module.exports={start,approve,poll,flows};
