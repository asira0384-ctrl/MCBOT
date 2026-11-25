'use strict';
// A test server calculates final slot counts from the requested action instead
// of accepting requests with an empty, uninformative response.
function stackResponse(bot,req,reject=false){if(reject)return {request_id:req.request_id,status:'error'};
 const action=req.actions[0],entries=[];const get=ref=>{const type=typeof ref.slot_type==='string'?ref.slot_type:ref.slot_type.container_id;return bot.array(type)?.[ref.slot]||null;};const put=(ref,item)=>entries.push({slot_type:ref.slot_type,slots:[{slot:ref.slot,hotbar_slot:ref.slot,count:item?.count||0,item_stack_id:item?.stack_id||0,custom_name:'',filtered_custom_name:'',durability_correction:0}]});
 const src=get(action.source),dst=action.destination?get(action.destination):null;
 if(action.type_id==='swap'){put(action.source,dst);put(action.destination,src);}
 else if(action.type_id==='drop')put(action.source,src&&src.count>action.count?{...src,count:src.count-action.count}:null);
 else if(action.type_id==='take'){put(action.source,src&&src.count>action.count?{...src,count:src.count-action.count}:null);put(action.destination,{...src,count:(dst?.count||0)+action.count});}
 else throw Error('Unhandled test server action');
 return {request_id:req.request_id,status:'ok',containers:entries};
}
module.exports={stackResponse};
