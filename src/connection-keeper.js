'use strict';
class ConnectionKeeper{
 constructor(manager,{schedule=setTimeout,cancel=clearTimeout}={}){this.manager=manager;this.schedule=schedule;this.cancelTimer=cancel;this.timers=new Map();this.attempts=new Map();this.status=new Map();}
 wanted(id,on,reason='user'){const state=this.manager.store.bot(id),changed=state.connectionWanted!==on||on&&state.connectionBlocked;state.connectionWanted=on;state.connectionBlocked=on?null:reason;if(!on){this.cancel(id);this.attempts.delete(id);}if(changed)this.manager.store.save();}
 cancel(id){if(this.timers.has(id))this.cancelTimer(this.timers.get(id));this.timers.delete(id);}
 eligible(id){const m=this.manager,state=m.store.bot(id);return !this.stopped&&!m.destroyed&&!m.shuttingDown&&m.names.has(id)&&state.connectionWanted===true&&!state.connectionBlocked;}
 restore(){let index=0;for(const id of this.manager.names.keys())if(this.eligible(id))this.queue(id,800+index++*1500);}
 queue(id,delay){if(!this.eligible(id)||this.timers.has(id))return;const count=this.attempts.get(id)||0;if(count>=6){this.status.set(id,{phase:'stopped',reason:'自動再接続が6回失敗しました。Webから接続をやり直してください'});return;}delay??=Math.min(60000,2000*2**count);this.status.set(id,{phase:'waiting',retryAt:Date.now()+delay,attempt:count+1});const timer=this.schedule(()=>{this.timers.delete(id);this.connect(id).catch(e=>this.failed(id,e));},delay);timer?.unref?.();this.timers.set(id,timer);this.manager.changed?.(id,'reconnect');}
 async connect(id){
  if(!this.eligible(id))return;const m=this.manager,worker=m.workers.get(id);if(worker?.bot.connected&&!worker.bot.ended){this.connected(id);return;}
  if(worker&&!worker.bot.ended&&worker.mode!=='disconnected')return;
  const auth=m.accounts.snapshot(id,m.names.get(id));if(!auth.saved||['checking','waiting','failed','expired'].includes(auth.state)){this.status.set(id,{phase:'authentication',reason:auth.error||'Microsoft認証をWebで確認してください'});m.notice(id,'保存認証を再確認してください。自動で認証を繰り返しません',{game:false});return;}
  this.attempts.set(id,(this.attempts.get(id)||0)+1);this.status.set(id,{phase:'connecting',attempt:this.attempts.get(id)});m.requestConnection(id);const pending=m.connectRequests?.get(id)?.promise;if(pending)await pending;
  if(this.eligible(id)&&m.connectionResults?.get(id)?.state==='failed'&&!m.workers.get(id)?.bot.connected)this.queue(id);
 }
 failed(id,error){this.status.set(id,{phase:'error',reason:String(error.message||error).slice(0,300)});if(this.eligible(id))this.queue(id);}
 lost(id){if(this.eligible(id))this.queue(id);}
 connected(id){this.cancel(id);this.attempts.delete(id);this.status.set(id,{phase:'connected'});}
 snapshot(id){const state=this.manager.store.bot(id);return {wanted:state.connectionWanted===true,blocked:state.connectionBlocked||null,...this.status.get(id)};}
 stop(){this.stopped=true;for(const id of this.timers.keys())this.cancel(id);}
}
module.exports={ConnectionKeeper};
