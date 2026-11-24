'use strict';
const {loadEnvFile}=require('node:process');
function loadLocalEnv(file='.env'){
 try{loadEnvFile(file);}catch(e){if(e.code!=='ENOENT')throw e;}
}
module.exports={loadLocalEnv};
