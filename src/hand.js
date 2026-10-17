'use strict';
function claim(bot){if(bot.handUse||bot.actionHandBusy)throw require('./item-use').busy();const lease={};bot.actionHandBusy=lease;return lease;}
function release(bot,lease){if(bot.actionHandBusy===lease)bot.actionHandBusy=false;}
module.exports={claim,release};
