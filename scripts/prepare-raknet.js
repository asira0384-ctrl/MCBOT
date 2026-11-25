'use strict';
const fs=require('node:fs');const path=require('node:path');
// The shipped N-API binary is independent of the Linux kernel major version.
// Upstream selects prebuilds by kernel major and misses Linux 6 hosts.
function prepare(){
 try{require('raknet-native');return;}catch{}
 const root=path.dirname(require.resolve('raknet-native/package.json'));
 const prebuilds=path.join(root,'prebuilds');
 const candidate=fs.readdirSync(prebuilds).sort().find(n=>n.startsWith(process.platform+'-')&&n.endsWith('-'+process.arch));
 if(!candidate)throw Error(`Native RakNetの同梱バイナリがありません: ${process.platform}/${process.arch}。Dockerのlinux/amd64で実行してください`);
 const dst=path.join(root,'build','Release');fs.mkdirSync(dst,{recursive:true});
 fs.copyFileSync(path.join(prebuilds,candidate,'node-raknet.node'),path.join(dst,'node-raknet.node'));
 try{require('raknet-native');}catch(e){throw Error('Native RakNetを読み込めません: '+e.message);}
}
if(require.main===module){prepare();console.log('Native RakNet ready');}
module.exports={prepare};
