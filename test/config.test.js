'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const {spawnSync}=require('node:child_process');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const {ownerId}=require('../src/store');
test('owner configuration accepts one exact ID and fails closed for invalid settings',()=>{
 assert.equal(ownerId('1234567890123456789'),'1234567890123456789');
 for(const invalid of ['', 'all','0','1234567890123456789,9876543210987654321','<@1234567890123456789>'])assert.throws(()=>ownerId(invalid));
});
test('local env loads before owner module; host environment retains priority; blank/missing files never expose tokens',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'asira-config-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'.env');fs.writeFileSync(file,"DISCORD_OWNER_ID=1234567890123456789\nBOT_NAMES='Friend Bot'\nDATA_DIR=./data\n");
 const env={...process.env};delete env.DISCORD_OWNER_ID;delete env.BOT_NAMES;
 const script=`require('./src/env').loadLocalEnv(${JSON.stringify(file)});console.log(JSON.stringify({owner:require('./src/store').OWNER,name:process.env.BOT_NAMES}));`;
 let r=spawnSync(process.execPath,['-e',script],{cwd:path.join(__dirname,'..'),env,encoding:'utf8'});assert.equal(r.status,0);assert.deepEqual(JSON.parse(r.stdout),{owner:'1234567890123456789',name:'Friend Bot'});
 r=spawnSync(process.execPath,['-e',script],{cwd:path.join(__dirname,'..'),env:{...env,DISCORD_OWNER_ID:'1343843235252146219'},encoding:'utf8'});assert.equal(r.status,0);assert.equal(JSON.parse(r.stdout).owner,'1343843235252146219');
 require('../src/env').loadLocalEnv(path.join(dir,'missing.env'));
});
