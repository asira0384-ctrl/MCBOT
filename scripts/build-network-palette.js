'use strict';
// Use the exact, pinned Geyser sources documented beside the generated tables.
const fs=require('node:fs'),zlib=require('node:zlib'),crypto=require('node:crypto'),path=require('node:path'),nbt=require('prismarine-nbt');
const sources={
 2193:{version:'1.26.51',source:'core/src/main/resources/bedrock/block_palette.26_50.nbt',sourceCommit:'50115039af4cd92e50545075d3a13eea6880cf88',sourceSha256:'54c9bed0bef30aadc316b21c6e82b5ac407c5c6e351b9d9690aa4e9a49fec912'},
 2225:{version:'1.26.60',source:'core/src/main/resources/bedrock/block_palette.26_60.nbt',sourceCommit:'d2cf20058c6c875f7036deb6f6c59e0c39775199',sourceSha256:'9d0feee0cd2edc1499bd7f7922615caee4dd268b598fca45dc396f4d0bdcdaa3'}
};
async function build(input,protocol){
 const source=sources[protocol];if(!input||!source)throw Error('node scripts/build-network-palette.js /path/to/block_palette.nbt <2193|2225>');
 const bytes=fs.readFileSync(input);if(crypto.createHash('sha256').update(bytes).digest('hex')!==source.sourceSha256)throw Error('Source checksum mismatch');
 const registry=require('minecraft-data')('bedrock_'+source.version),byName=new Map();
 registry.blockStates.forEach((b,i)=>{const name='minecraft:'+b.name,entries=byName.get(name)||[];entries.push([i,Object.fromEntries(Object.entries(b.states).map(([k,v])=>[k,v.value]))]);byName.set(name,entries);});
 const blocks=nbt.simplify((await nbt.parse(bytes)).parsed).blocks;
 const states=blocks.map(b=>{const matches=(byName.get(b.name)||[]).filter(([,s])=>Object.entries(s).every(([k,v])=>b.states[k]===v));if(matches.length>1)throw Error('Ambiguous local state: '+b.name);return matches[0]?.[0]??-1;});
 const metadata={protocol:Number(protocol),minecraftDataVersion:require('minecraft-data/package.json').version,...source,states,hashes:blocks.map(b=>b.network_id)};
 fs.writeFileSync(path.join(__dirname,`../vendor/bedrock-palettes/${protocol}.json.gz`),zlib.gzipSync(JSON.stringify(metadata)));
 console.log(`Protocol ${protocol}: ${states.length} network states; ${states.filter(id=>id>=0).length} mapped`);
}
if(require.main===module)build(process.argv[2],process.argv[3]||2193).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={build,sources};
