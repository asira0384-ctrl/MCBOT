'use strict';
const fail=(status,message)=>Object.assign(Error(message),{status});
function user(session){return String(session.discordId||session.owner);}
function lock(web,session){if(session.discordOAuth!==true)throw fail(401,'Sign in with Discord in your browser.');if(!web.isAllowed(user(session)))throw fail(403,'Discord bot access is not permitted');}
function status(web,session){lock(web,session);return {setup:false,unlocked:true,profile:web.publicProfile(session),csrf:session.csrf};}
// Compatibility endpoint for older desktop clients; Discord authorization is still required.
async function password(web,session){return status(web,session);}
module.exports={status,password,lock};
