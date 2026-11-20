'use strict';
// Never present a Microsoft device-code success as successful Minecraft join.
function message(error){
 const raw=String(error?.message||error||'');
 if(/\b401\b/.test(raw)&&/multiplayer\/bedrock\/authentication|UNAUTHORIZED/i.test(raw)){
  return '401 UNAUTHORIZED: Minecraft統合版の公式認証が拒否されました。認証コード入力だけでは入室できません。正しいゲーマータグ、Bedrockの利用資格、Xboxマルチプレイ権限、アカウントの状態を確認してください。保存認証が古い場合は /auth target:<番号> fresh:true で再認証できます。再認証しても401ならアカウントまたは公式認証側の問題で、Botからは回避できません。';
 }
 return null;
}
module.exports={message};
