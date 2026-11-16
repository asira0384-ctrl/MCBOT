'use strict';
// Only a verified admin reaches this translator. Validate the entire model output before dispatch.
module.exports=async(q,model,key)=>{
 if(!key)return null;
 const schema='Return one Minecraft bot command without formatting, or NONE if unclear, multiple actions, or unsupported. Commands: start, stop, follow NAME, skinstealer NAME, autoemote SECONDS or off, goto X Y Z, scaffold on/off, autototem on/off, autoslot on/off, killaura on/off, crystalaura on/off. Do not choose target bot numbers; caller handles scope. Do not invent names or coordinates.';
 const r=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model)+':generateContent',{method:'POST',signal:AbortSignal.timeout(12000),headers:{'x-goog-api-key':key,'Content-Type':'application/json'},body:JSON.stringify({systemInstruction:{parts:[{text:schema}]},contents:[{role:'user',parts:[{text:q}]}]})});if(!r.ok)throw Error('Gemini HTTP '+r.status);
 const cmd=(await r.json()).candidates?.[0]?.content?.parts?.filter(x=>!x.thought).map(x=>x.text||'').join('').trim();return cmd&&/^(?:start|stop|(?:skinstealer|follow) [\w -]{1,32}|autoemote (?:off|\d{1,4})|goto -?\d+ -?\d+ -?\d+|(?:scaffold|autototem|autoslot|killaura|crystalaura) (?:on|off))$/.test(cmd)?cmd:null;
};
