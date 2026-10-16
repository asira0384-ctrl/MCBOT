'use strict';
// Shared with the regression tests; drag operations are tied to one account
// and to the exact server snapshot from which the drag started.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.AsiraUI=api;})(globalThis,()=>({
 drag(bot,slot){const item=bot?.inventory?.[slot];return bot?.connected&&item?.name?{bot:String(bot.id),slot,token:item.token,count:item.count}:null;},
 validateDrag(drag,bot){return !!drag&&String(bot?.id)===drag.bot&&bot?.connected&&bot.inventory?.[drag.slot]?.token===drag.token;},
 loginView(auth={}){
  const c=auth.connection||{},waiting=['checking','waiting','connecting'].includes(auth.state);
  let title='Minecraftは未接続';
  if(c.state==='failed')title='Minecraftへの接続に失敗しました';
  else if(c.state==='spawned')title='サーバー初期ワールドのspawnを受信しました';
  else if(c.state==='cancelled')title='接続をキャンセルしました';
  else if(auth.code)title='Microsoftでコードを入力してください';
  else if(auth.state==='checking')title='Microsoft / Xbox に認証を確認中';
  else if(c.state==='connecting'||auth.autoConnect)title='Minecraftへ接続中';
  else if(auth.state==='failed'||auth.state==='expired')title='Microsoft認証をやり直してください';
  else if(['ready','saved'].includes(auth.state))title='Microsoft認証は完了・Minecraftは未接続';
  return {title,authLabel:auth.code?'コード入力待ち':auth.state==='checking'?'確認中':auth.state==='connected'?'接続時に認証を確認済み':auth.saved?'認証情報あり（接続時に再確認）':auth.profile?'過去の認証履歴あり・再認証が必要':'未認証',connectionLabel:c.state==='spawned'?'初期spawn受信。本ワールド到着は未確認':c.phase||'未接続',error:c.error||auth.error||'',busy:!!auth.autoConnect||waiting&&c.state!=='failed'&&c.state!=='cancelled',canConnect:c.state!=='spawned'&&(!waiting||c.state==='failed'||c.state==='cancelled')};
 },
 pendingAlerts(bots,seen){const alerts=[];for(const bot of bots||[]){const job=bot.restock;if(job?.status==='pending'&&!seen.has(job.id)){seen.add(job.id);alerts.push({bot,job});}}return alerts;}
}));
