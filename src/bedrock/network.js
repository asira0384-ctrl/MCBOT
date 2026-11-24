'use strict';
const dns=require('node:dns/promises');const net=require('node:net');const bedrock=require('bedrock-protocol');const {Versions}=require('bedrock-protocol/src/options');
async function diagnose(host,port){
 let address;try{address=net.isIP(host)===4?host:(await dns.lookup(host,{family:4})).address;}catch(e){return `DNS解決失敗: ${host} (${e.code||e.message})`;}
 try{const ad=await bedrock.ping({host:address,port,transport:'raknet',timeout:5000});const version=Object.keys(Versions).find(v=>Versions[v]===Number(ad.protocol));return `DNS: ${host} → ${address}\nUDP ${port}: 応答あり\nサーバー: ${ad.motd}\n広告版: ${ad.version} / protocol ${ad.protocol}\n対応版: ${version||'未対応'}\n通信ライブラリ: Native RakNet`;}catch(e){return `DNS: ${host} → ${address}\nUDP ${port}: 応答を確認できません (${e.message})\nMicrosoft認証とは別の通信診断です。サーバーがpingに応答しない場合もあります`;}
}
module.exports={diagnose};
