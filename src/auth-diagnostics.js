'use strict';
// Server-side error classifier: never treats a saved Microsoft token as Minecraft entitlement.
function message(error) {
  const raw = String(error?.message || error || '');
  if (/\b401\b/.test(raw) && /multiplayer\/bedrock\/authentication|UNAUTHORIZED/i.test(raw)) {
    return 'Minecraft統合版の公式認証サービスから401 UNAUTHORIZED。Microsoftログイン済みでも、このXboxアカウントのMinecraft利用資格が拒否されています。正規のBedrock利用資格・マルチプレイ許可を確認してください。再ログインは /auth target:<番号> fresh:true（または /panel のMicrosoft再認証）で実行できます。認証をやり直してもライセンスがないアカウントは接続できません。';
  }
  return null;
}
module.exports = {message};
