'use strict';
async function change(interaction,manager,panel,action,user,owner){
 require('./access').update(manager.store,interaction.user.id,action,user,owner);
 manager.web?.pump();
 const name=String(user.globalName||user.username||user.id).slice(0,80);
 if(action==='remove'){await interaction.editReply({content:`${name} のWeb・パネルの利用許可を解除しました。`,allowedMentions:{parse:[]}});return;}
 await interaction.editReply({content:`${name} を登録しました。Webと /panel をすぐ使えます。相手は下の共有ボタン、または /web・/panel から開始できます。`,allowedMentions:{parse:[]}});
 // This shared message contains no login token. Each click is authorized for
 // the clicking Discord user, and their actual Web link is sent privately.
 const entry={...panel.entryMessage(),content:`<@${user.id}> のWeb・パネルの利用準備ができました。ボタンから開けます。`,flags:0,allowedMentions:{parse:[]}};
 try{await interaction.followUp(entry);}catch{await interaction.editReply({content:`${name} を登録しました。共有ボタンを置けなかったため、相手本人が /panel または /web を実行してください。`,allowedMentions:{parse:[]}});}
}
module.exports={change};
