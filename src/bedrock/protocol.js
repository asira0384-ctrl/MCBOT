'use strict';
// Packet constructors kept separate so schema checks can run without signing in.
const emptyItem=()=>({network_id:0,count:0,metadata:0,has_stack_id:false,block_runtime_id:0,extra:{has_nbt:false,can_place_on:[],can_destroy:[]}});
// PlayerAuthInput block actions are a restricted subset of PlayerAction.
// In particular, get_updated_block is not a legal input block action.
const blockActionNames=new Set(['start_break','abort_break','stop_break','crack_break','predict_break','continue_break']);
function blockActions(bot,actions){
 const valid=[];let rejected=0;
 for(const a of actions||[]){if(!blockActionNames.has(a?.action)){rejected++;continue;}valid.push(a.action==='stop_break'?{action:a.action,position:{x:0,y:0,z:0},face:0}:a);}
 if(rejected){bot.lastPacketIssue='無効な採掘操作を送信前に除外しました';bot.rejectedBlockActions=(bot.rejectedBlockActions||0)+rejected;}
 return valid.slice(0,100);
}
function useItem(bot,action,position,face=1,blockRuntime=0) {
 return {transaction:{legacy:{legacy_request_id:0},transaction_type:'item_use',actions:[],transaction_data:{
  action_type:action,hand:'main_hand',client_cooldown_state:'off',trigger_type:'player_input',block_position:position,face:face<0&&bot.registry?.protocol.types.TransactionUseItem?.[1]?.find(f=>f.name==='face')?.type==='u8'?255:face,hotbar_slot:bot.quickBarSlot,
  held_item:bot.items[bot.quickBarSlot]||emptyItem(),player_pos:{x:bot.entity.position.x,y:bot.entity.position.y+1.62,z:bot.entity.position.z},
  click_pos:action==='click_block'?{x:face===4?0:face===5?1:.5,y:face===0?0:face===1?1:.5,z:face===2?0:face===3?1:.5}:{x:.5,y:.5,z:.5},block_runtime_id:blockRuntime,client_prediction:'success'}}};
}
function slotRef(type,slot,item) {return {slot_type:{container_id:type==='level_entity'?'container':type,dynamic_container_id:undefined},slot,stack_id:item?.stack_id||0};}
// Modern variant indexes omit the two removed container actions. The nested
// legacy action byte still includes them: mine_block is variant 9, legacy 11.
const legacyStackActions={take:0,place:1,swap:2,drop:3,destroy:4,consume:5,create:6,lab_table_combine:9,beacon_payment:10,mine_block:11,craft_recipe:12,craft_recipe_auto:13,craft_creative:14,optional:15,craft_grindstone_request:16,craft_loom_request:17,non_implemented:18,results_deprecated:19};
function request(id,actions){return {requests:[{request_id:id,actions:actions.map(a=>({...a,legacy_type_id:legacyStackActions[a.type_id]??a.legacy_type_id??0})),custom_names:[],cause:-1}]};}
function adaptRequest(bot,p){const modern=bot.registry.protocol.types.StackRequestSlotInfo?.[1]?.find(f=>f.name==='slot_type')?.type==='FullContainerName';return {...p,requests:p.requests.map(r=>({...r,actions:r.actions.map(a=>{const copy={...a};for(const field of ['source','destination'])if(a[field]){const ref=a[field],type=typeof ref.slot_type==='string'?ref.slot_type:ref.slot_type.container_id;copy[field]={...ref,slot_type:modern?(typeof ref.slot_type==='object'?ref.slot_type:{container_id:type,dynamic_container_id:undefined}):type};}return copy;})}))};}
function adaptInput(bot,p) {
 let flags=p.input_data; if(typeof flags==='bigint') {
  const names=bot.registry.protocol.types.InputFlag?.[1]?.flags||Object.values(bot.registry.protocol.types.InputData?.[1]?.mappings||{});flags=Object.fromEntries(names.map((s,i)=>[s,!!(p.input_data&(1n<<BigInt(i)))]));
 }
 flags=Array.isArray(flags)?Object.fromEntries(flags.map(s=>[s,true])):{...flags};
 if(!bot.handUse){const actions=bot.pendingBreakActions?.splice(0)||[];if(bot.breakAction){actions.push(bot.breakAction);bot.breakAction=null;}if(actions.length){flags.block_action=true;flags.block_breaking_delay_enabled=true;p.block_action=actions;}if(bot.pendingMiningRequest){flags.item_stack_request=true;p.item_stack_request=bot.pendingMiningRequest;bot.pendingMiningRequest=null;}}
 if(bot.pendingTeleport){flags.handled_teleport=true;bot.pendingTeleport=false;}
 if(bot.pendingServerData){flags.received_server_data=true;bot.pendingServerData=false;}
 if(bot.pendingGlide){flags[bot.pendingGlide==='start'?'start_gliding':'stop_gliding']=true;bot.pendingGlide=null;}
 if(bot.usingItem&&!bot.lastUsingItem)flags.start_using_item=true;bot.lastUsingItem=!!bot.usingItem;
 const jumping=!!bot.controlState.jump;flags.start_jumping=jumping&&!bot.lastJump;flags.jump_pressed_raw=jumping&&!bot.lastJump;flags.jump_current_raw=jumping;bot.lastJump=jumping;
 flags.start_sprinting=!!bot.controlState.sprint&&!bot.lastSprint;flags.stop_sprinting=!bot.controlState.sprint&&bot.lastSprint;bot.lastSprint=!!bot.controlState.sprint;
 flags.start_sneaking=!!bot.controlState.sneak&&!bot.lastSneak; flags.stop_sneaking=!bot.controlState.sneak&&bot.lastSneak;bot.lastSneak=!!bot.controlState.sneak;
 // Conditional payload and presence flags must agree on every input frame.
 p.block_action=blockActions(bot,p.block_action);
 flags.block_action=Array.isArray(p.block_action)&&p.block_action.length>0;
 if(!flags.block_action)delete p.block_action;
 flags.item_stack_request=!!p.item_stack_request;
 flags.item_interact=!!p.transaction;
 flags.client_predicted_vehicle=p.vehicle_rotation!=null&&p.predicted_vehicle!=null;
 if(!flags.client_predicted_vehicle){delete p.vehicle_rotation;delete p.predicted_vehicle;}
 const arrayFlags=bot.registry.protocol.types.packet_player_auth_input?.[1]?.find(f=>f.name==='input_data')?.type?.[0]==='array';
 const deg=180/Math.PI;
 const vector={x:-(p.move_vector?.x||0),y:-(p.move_vector?.y||0)};
 const yaw=p.yaw||0,pitch=p.pitch||0;const camera={x:-Math.sin(yaw)*Math.cos(pitch),y:-Math.sin(pitch),z:Math.cos(yaw)*Math.cos(pitch)};
 return {...p,move_vector:vector,analogue_move_vector:vector,pitch:(p.pitch||0)*deg,yaw:(p.yaw||0)*deg,head_yaw:(p.head_yaw||0)*deg,tick:p.tick??BigInt(bot.tick||0),input_data:arrayFlags?Object.keys(flags).filter(k=>flags[k]):flags,input_mode:'mouse',play_mode:'normal',interaction_model:'crosshair',
  interact_rotation:{x:(p.pitch||0)*deg,y:(p.yaw||0)*deg},camera_orientation:camera,raw_move_vector:vector};
}
function legacyMove(bot,p){return {runtime_id:BigInt(bot._runtimeEntityId),position:p.position,pitch:p.pitch,yaw:p.yaw,head_yaw:p.head_yaw,mode:'normal',on_ground:!!bot.entity?.onGround,ridden_runtime_id:0n,tick:p.tick};}
function attack(bot,actor){return {transaction:{legacy:{legacy_request_id:0},transaction_type:'item_use_on_entity',actions:[],transaction_data:{entity_runtime_id:BigInt(actor.id),action_type:'attack',hotbar_slot:bot.quickBarSlot,held_item:bot.items[bot.quickBarSlot]||emptyItem(),player_pos:{x:bot.entity.position.x,y:bot.entity.position.y+1.62,z:bot.entity.position.z},click_pos:{x:0,y:0,z:0}}}};}
module.exports={useItem,slotRef,request,adaptRequest,adaptInput,emptyItem,legacyMove,attack,blockActions,blockActionNames};
