'use strict';
const crypto=require('node:crypto');
const OWNER=require('./store').OWNER;
const ID=/^[1-9]\d{16,19}$/;
function permitted(store,id,owner=OWNER){return require('./access').operator(store,id,owner);}
function grant(store,actor,action,user,owner=OWNER){return require('./access').update(store,actor,action,user,owner);}
function profile(user){if(!ID.test(String(user?.id)))throw Error('Discordのユーザー情報を確認できません');const hash=/^(?:a_)?[a-f0-9]{32}$/.test(user.avatar||'')?user.avatar:null;const fallback=Number((BigInt(user.id)>>22n)%6n);return {id:user.id,name:String(user.global_name||user.username||user.id).slice(0,80),username:String(user.username||user.id).slice(0,80),avatar:hash?`https://cdn.discordapp.com/avatars/${user.id}/${hash}.png?size=128`:`https://cdn.discordapp.com/embed/avatars/${fallback}.png`};}
class DiscordLogin{
 constructor(web,fetchFn=globalThis.fetch){this.web=web;this.fetch=fetchFn;this.states=new Map();}
 ready(){return !!((this.web.env.DISCORD_CLIENT_ID||this.web.oauthClientId)&&this.web.env.DISCORD_CLIENT_SECRET&&this.web.base);}
 redirect(){return this.web.base+'/oauth/discord/callback';}
 start(req,res){if(!this.ready())throw Object.assign(Error('Discordログインの設定が必要です。DISCORD_CLIENT_SECRETと公開URLを設定し、Discord側に表示されたコールバックURLを登録してください'),{status:503});for(const [key,v]of this.states)if(v.expires<this.web.now())this.states.delete(key);if(this.states.size>=100)throw Object.assign(Error('少し待ってログインしてください'),{status:429});
  const state=crypto.randomBytes(32).toString('base64url'),binding=crypto.randomBytes(32).toString('base64url');this.states.set(state,{binding,expires:this.web.now()+300000});
  res.setHeader('Set-Cookie',`asira_oauth=${binding}; Path=/oauth/discord; HttpOnly; SameSite=Lax; Max-Age=300${this.web.base.startsWith('https:')?'; Secure':''}`);
  const url=new URL('https://discord.com/oauth2/authorize');url.search=new URLSearchParams({client_id:this.web.env.DISCORD_CLIENT_ID||this.web.oauthClientId,response_type:'code',redirect_uri:this.redirect(),scope:'identify',state}).toString();res.writeHead(302,{Location:url.href});res.end();
 }
 async callback(req,res,url){const state=url.searchParams.get('state'),pending=this.states.get(state),binding=String(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('asira_oauth='))?.slice(12);this.states.delete(state);
  res.setHeader('Set-Cookie','asira_oauth=; Path=/oauth/discord; HttpOnly; SameSite=Lax; Max-Age=0'+(this.web.base.startsWith('https:')?'; Secure':''));
  if(!pending||pending.expires<=this.web.now()||!binding||binding!==pending.binding)throw Object.assign(Error('ログイン確認が期限切れです。Discordでログインを押し直してください'),{status:403});
  const code=url.searchParams.get('code');if(!code||code.length>2000||url.searchParams.get('error')||url.searchParams.get('iss')&&url.searchParams.get('iss')!=='https://discord.com')throw Object.assign(Error('Discordログインを完了できませんでした'),{status:403});
  const response=await this.fetch('https://discord.com/api/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:this.web.env.DISCORD_CLIENT_ID||this.web.oauthClientId,client_secret:this.web.env.DISCORD_CLIENT_SECRET,grant_type:'authorization_code',code,redirect_uri:this.redirect()}),signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Discordの認証コード交換に失敗しました');const token=await response.json();if(typeof token.access_token!=='string')throw Error('Discordの認証を確認できません');
  const who=await this.fetch('https://discord.com/api/v10/users/@me',{headers:{Authorization:'Bearer '+token.access_token},signal:AbortSignal.timeout(15000)});if(!who.ok)throw Error('Discordのプロフィールを取得できません');const user=profile(await who.json());if(!permitted(this.web.manager.store,user.id,this.web.owner))throw Object.assign(Error('AsiraからWebの利用を許可されていません'),{status:403});
  this.web.createSession(req,res,user);res.writeHead(302,{Location:'/'});res.end();
 }
}
module.exports={DiscordLogin,permitted,grant,profile};
