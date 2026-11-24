'use strict';
const {Routes}=require('discord.js');
async function registerCommands(rest,applicationId,commands,guildIds){const body=commands.map(c=>c.toJSON?c.toJSON():c),results=[];
 for(const [scope,route]of [['global',Routes.applicationCommands(applicationId)],...[...new Set(guildIds)].filter(Boolean).map(id=>[id,Routes.applicationGuildCommands(applicationId,id)])]){
  try{await rest.put(route,{body});results.push({scope,ok:true});}catch(e){results.push({scope,ok:false,message:e.message});}
 }
 return results;
}
async function publishEntry(client,manager,panel){const id=manager.store.data.logChannel;if(!id)return;
 const channel=await client.channels.fetch(id);if(!channel?.isTextBased())return;
 const payload=panel.entryMessage();const old=manager.store.data.controlPanelMessageId;
 if(old){try{const message=await channel.messages.fetch(old);if(message.author.id===client.user.id){await message.edit(payload);return;}}catch{}}
 const message=await channel.send(payload);manager.store.data.controlPanelMessageId=message.id;manager.store.save();
}
module.exports={registerCommands,publishEntry};
