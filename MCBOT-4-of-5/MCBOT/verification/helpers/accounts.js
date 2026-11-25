'use strict';
// Scenarios that exercise a fleet register their accounts explicitly. A clean
// production install now starts empty and is configured from the Web UI.
function configured(store){store.data.accountSlots=Array.from({length:10},(_,i)=>({id:i+1,name:`Aslrq${String(i+1).padStart(2,'0')}x`}));store.data.accountSlots.push({id:11,name:process.env.IGN_BOT_NAME||'Aslrq00x'});return store;}
module.exports={configured};
