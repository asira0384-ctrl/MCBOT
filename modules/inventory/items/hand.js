'use strict';
function claim(bot,kind='action'){if(bot.handUse||bot.actionHandBusy||require('./inventory').touches(bot,bot.quickBarSlot))throw require('./item-use').busy();const lease={slot:bot.quickBarSlot,kind};bot.actionHandBusy=lease;return lease;}
function release(bot,lease){if(bot.actionHandBusy===lease){bot.actionHandBusy=false;bot.emit?.('handAvailable');}}
function flush(bot){if(typeof bot.client?._tick!=='function')return false;bot.client._tick();return true;}
async function settled(bot,signal,kind){if(kind==='combat'&&flush(bot)){await require('node:timers/promises').setTimeout(0,undefined,{signal});if(signal?.aborted||bot.dead||!bot.connected)throw Error('停止しました');return;}const ms=Math.max(0,50-(Date.now()-(bot.selectedAt||0)));if(ms)await require('node:timers/promises').setTimeout(ms,undefined,{signal});if(signal?.aborted||bot.dead||!bot.connected)throw Error('停止しました');}
function protects(bot,type,slot){return !!bot.actionHandBusy&&['inventory','hotbar','hotbar_and_inventory'].includes(type)&&(bot.actionHandBusy.slot??bot.quickBarSlot)===slot;}
module.exports={claim,release,settled,protects,flush};
