'use strict';
const crypto=require('node:crypto');
const fail=text=>Object.assign(Error(text),{status:409});
function attach(bot){
 bot.client.on('modal_form_request',packet=>{
  try{
   if(typeof packet.data!=='string'||Buffer.byteLength(packet.data)>65536)return;
   const form=JSON.parse(packet.data);
   if(!form||!['custom_form','form','modal'].includes(form.type)||!Number.isInteger(packet.form_id)||packet.form_id<0)return;
   if(form.type==='custom_form'&&(!Array.isArray(form.content)||form.content.length>64))return;
   if(form.type==='form'&&(!Array.isArray(form.buttons)||form.buttons.length>64))return;
   if(form.type==='custom_form'&&form.content.some(field=>!field||typeof field!=='object'||typeof field.type!=='string'||(field.type==='toggle'&&field.default!==undefined&&typeof field.default!=='boolean')))return;
   if(form.type==='form'&&form.buttons.some(button=>!button||typeof button!=='object'))return;
   bot.pendingServerForm={token:crypto.randomUUID(),id:packet.form_id,form,receivedAt:Date.now()};
   bot.emit('serverForm');bot.emit('serverMessage','Manual server form received: '+String(form.title||'Server Form').slice(0,100));
  }catch{bot.emit('diagnostic','Server sent an unsupported form');}
 });
 bot.once('end',()=>{bot.pendingServerForm=null;bot.emit('serverForm');});
}
function snapshot(bot){return bot&&!bot.ended&&bot.pendingServerForm?structuredClone(bot.pendingServerForm):null;}
function respond(bot,token,value,cancel=false){
 const pending=bot?.pendingServerForm;
 if(!pending||bot.ended||bot.client?._closed||pending.token!==token)throw fail('This form changed or the bot disconnected. Open the current form.');
 const form=pending.form;let response=value;
 if(!cancel){
  if(form.type==='custom_form'){
   if(!Array.isArray(value)||value.length!==form.content.length)throw fail('Check every form field');
   response=form.content.map((field,index)=>{
    if(field.type==='label')return null;
    if(field.type==='input' && typeof value[index]==='string' && Buffer.byteLength(value[index])<=4096)return value[index];
    if(field.type==='toggle'&&typeof value[index]==='boolean')return value[index];
    throw fail('This field type is not supported by the manual toggle editor');
   });
  }else if(form.type==='form'){
   if(!Number.isInteger(value)||value<0||value>=form.buttons.length)throw fail('Choose a form button');
  }else if(typeof value!=='boolean')throw fail('Choose a modal button');
 }
 bot.client.queue('modal_form_response',{form_id:pending.id,has_response_data:!cancel,data:cancel?undefined:JSON.stringify(response),has_cancel_reason:!!cancel,...(cancel?{cancel_reason:'closed'}:{})});
 if(bot.pendingServerForm===pending)bot.pendingServerForm=null;
 bot.emit('serverForm');return {result:cancel?'Form closed':'Form response sent; waiting for the server'};
}
module.exports={attach,snapshot,respond};
