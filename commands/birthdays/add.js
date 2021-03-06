/**
 *   ╔════   Copyright 2019 Peter Maguire
 *  ║ ════╗  Created 07/09/2019
 * ╚════ ║   (ocelotbotv5) add
 *  ════╝
 */
const chrono = require('chrono-node');
module.exports = {
    name: "Add Birthday",
    usage: "add @user date" ,
    commands: ["add", "new"],
    run: async function(message, args, bot){
        let target = message.author;
        if(message.mentions.users.size > 0)
            target = message.mentions.users.first();
        let date = chrono.parseDate(message.content);
        if(!date)
            return message.replyLang("BIRTHDAY_ADD_DATE", {command: args[0], arg: args[1], user: bot.client.user});
        try{
            try {
                await bot.database.addBirthday(target.id, message.guild.id, date);
                message.replyLang("BIRTHDAY_ADD_SUCCESS");
            }catch(e){
                message.replyLang("BIRTHDAY_ADD_EXISTS", {command: args[0], target});
            }

        }catch(e){
            console.error(e);
        }
    }
};