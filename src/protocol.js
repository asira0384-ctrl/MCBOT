'use strict';
// Packet constructors kept separate so schema checks can run without signing in.
const emptyItem=()=>({network_id:0,count:0,metadata:0,has_stack_id:false,block_runtime_id:0,extra:{has_nbt:false,can_place_on:[],can_destroy:[]}});
function useItem(bot,action,position,face=1,blockRuntime=0) {
 return {transaction:{legacy:{legacy_request_id:0},transaction_type:'item_use',actions:[],transaction_data:{
  action_type:action,hand:'main_hand',client_cooldown_state:'off',trigger_type:'player_input',block_position:position,face:face<0&&bot.registry?.protocol.types.TransactionUseItem?.[1]?.find(f=>f.name==='face')?.type==='u8'?255:face,hotbar_slot:bot.quickBarSlot,
  held_item:bot.items[bot.quickBarSlot]||emptyItem(),player_pos:{x:bot.entity.position.x,y:bot.entity.position.y+1.62,z:bot.entity.position.z},
  click_pos:{x:0.5,y:0.5,z:0.5},block_runtime_id:blockRuntime,client_prediction:'success'}}};
}
function slotRef(type,slot,item) {return {slot_type:{container_id:type,dynamic_container_id:undefined},slot,stack_id:item?.stack_id||0};}
function request(id,actions){return {requests:[{request_id:id,actions:actions.map(a=>({...a,legacy_type_id:{take:0,place:1,swap:2,drop:3}[a.type_id]??0})),custom_names:[],cause:-1}]};}
function adaptInput(bot,p) {
 let flags=p.input_data; if(typeof flags==='bigint') {
  const names=bot.registry.protocol.types.InputFlag?.[1]?.flags||Object.values(bot.registry.protocol.types.InputData?.[1]?.mappings||{});flags=Object.fromEntries(names.map((s,i)=>[s,!!(p.input_data&(1n<<BigInt(i)))]));
 }
 flags=Array.isArray(flags)?Object.fromEntries(flags.map(s=>[s,true])):{...flags};
 if(bot.breakAction) { flags.block_action=true; flags.block_breaking_delay_enabled=true;p.block_action=[bot.breakAction];bot.breakAction=null; }
 if(bot.pendingTeleport){flags.handled_teleport=true;bot.pendingTeleport=false;}
 if(bot.usingItem) flags.start_using_item=true;
 const jumping=!!bot.controlState.jump;flags.start_jumping=jumping&&!bot.lastJump;flags.jump_pressed_raw=jumping&&!bot.lastJump;flags.jump_current_raw=jumping;bot.lastJump=jumping;
 flags.start_sneaking=!!bot.controlState.sneak&&!bot.lastSneak; flags.stop_sneaking=!bot.controlState.sneak&&bot.lastSneak;bot.lastSneak=!!bot.controlState.sneak;
 const arrayFlags=bot.registry.protocol.types.packet_player_auth_input?.[1]?.find(f=>f.name==='input_data')?.type?.[0]==='array';
 const deg=180/Math.PI;
 return {...p,pitch:(p.pitch||0)*deg,yaw:(p.yaw||0)*deg,head_yaw:(p.head_yaw||0)*deg,tick:p.tick??BigInt(bot.tick||0),input_data:arrayFlags?Object.keys(flags).filter(k=>flags[k]):flags,input_mode:'mouse',play_mode:'normal',interaction_model:'crosshair',
  interact_rotation:{x:(p.pitch||0)*deg,y:(p.yaw||0)*deg},camera_orientation:{x:0,y:0,z:1},raw_move_vector:p.move_vector||{x:0,y:0}};
}
function legacyMove(bot,p){return {runtime_id:BigInt(bot._runtimeEntityId),position:p.position,pitch:p.pitch,yaw:p.yaw,head_yaw:p.head_yaw,mode:'normal',on_ground:!!bot.entity?.onGround,ridden_runtime_id:0n,tick:p.tick};}
module.exports={useItem,slotRef,request,adaptInput,emptyItem,legacyMove};
