'use strict';
const {AsyncLocalStorage}=require('node:async_hooks');
const {setTimeout:wait}=require('node:timers/promises');
const storage=new AsyncLocalStorage(),clients=new WeakMap();let installed=false;
const allowed=new Set(['login.live.com','login.microsoftonline.com','user.auth.xboxlive.com','device.auth.xboxlive.com','title.auth.xboxlive.com','sisu.xboxlive.com','xsts.auth.xboxlive.com','multiplayer.minecraft.net','authorization.franchise.minecraft-services.net','20ca2.playfabapi.com']);
const transient=new Set(['EAI_AGAIN','ECONNRESET','ECONNREFUSED','ETIMEDOUT','ENETUNREACH','EHOSTUNREACH','UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_SOCKET']);
function codes(error){const found=new Set(),seen=new Set();function visit(e){if(!e||typeof e!=='object'||seen.has(e))return;seen.add(e);if(typeof e.code==='string'&&/^[A-Z0-9_]{1,64}$/.test(e.code))found.add(e.code);visit(e.cause);for(const sub of Array.isArray(e.errors)?e.errors:[])visit(sub);}visit(error);return [...found];}
function retryable(error){const list=codes(error);return list.length?list.some(code=>transient.has(code)):error?.name==='TypeError'&&error?.message==='fetch failed'||error?.name==='TimeoutError';}
function details(error){const list=codes(error);if(error?.authHost)return `認証通信失敗: ${error.authHost} / ${list.join(', ')||error.authFailure||'原因コードなし'}`;return list.length?`通信エラー (${list.join(', ')})`:null;}
function cancelled(scope,init){scope.signal?.throwIfAborted();init?.signal?.throwIfAborted();if(scope.closed?.())throw new DOMException('Connection closed','AbortError');}
async function authFetch(fetchFn,input,init,scope,{sleep=(ms,signal)=>wait(ms,undefined,{signal}),timeoutMs=20000}={}){
 let url;try{url=new URL(typeof input==='string'||input instanceof URL?input:input.url);}catch{return fetchFn(input,init);}
 // Only this bot's authentication requests are retried. Discord and other
 // fetch users retain their original transport and error handling.
 if(!allowed.has(url.hostname)||url.protocol!=='https:'||input instanceof Request)return fetchFn(input,init);
 if(init?.body!=null&&typeof init.body!=='string'&&!(init.body instanceof URLSearchParams))return fetchFn(input,init);
 for(let attempt=0;attempt<3;attempt++){
  cancelled(scope,init);let reason;
  const signals=[scope.signal,init?.signal,AbortSignal.timeout(timeoutMs)].filter(Boolean),signal=AbortSignal.any(signals);
  try{
   const response=await fetchFn(input,{...init,signal});
   if(![429,502,503,504].includes(response.status)||attempt===2)return response;
   const retryAfter=response.headers?.get('retry-after'),seconds=Number(retryAfter);let retryMs=retryAfter?Number.isFinite(seconds)?seconds*1000:Date.parse(retryAfter)-Date.now():null;
   if(retryAfter&&(!Number.isFinite(retryMs)||retryMs>10000))return response;
   reason=`HTTP ${response.status}`;await response.body?.cancel();
   scope.notify?.(`認証通信を再試行 ${attempt+1}/2: ${url.hostname} / ${reason}`);
   await sleep(Math.max(retryMs||0,attempt===0?1000:3000),scope.signal);continue;
  }catch(error){
   cancelled(scope,init);
   if(attempt===2||!retryable(error)){error.authHost=url.hostname;error.authFailure=error.name;throw error;}
   reason=codes(error).join(', ')||error.name;
  }
  scope.notify?.(`認証通信を再試行 ${attempt+1}/2: ${url.hostname} / ${reason}`);
  await sleep(attempt===0?1000:3000,scope.signal);
 }
}
function install(){if(installed)return;installed=true;const originalFetch=globalThis.fetch.bind(globalThis);globalThis.fetch=(input,init)=>{const scope=storage.getStore();return scope?authFetch(originalFetch,input,init,scope):originalFetch(input,init);};
 const auth=require('bedrock-protocol/src/client/auth'),originalAuthenticate=auth.authenticate;
 auth.authenticate=(client,options)=>{const scope=clients.get(client);return scope?storage.run(scope,()=>originalAuthenticate(client,options)):originalAuthenticate(client,options);};
}
function attach(bot){install();const controller=new AbortController(),scope={signal:controller.signal,closed:()=>bot.ended||bot.client._closed,notify:text=>bot.emit('diagnostic',text)};clients.set(bot.client,scope);bot.once('end',()=>{controller.abort();const flow=bot.client.options?.authflow;if(flow?.msa)flow.msa.polling=false;});return scope;}
function run(scope,fn){install();return storage.run(scope,fn);}
module.exports={run,attach,authFetch,codes,retryable,details};
