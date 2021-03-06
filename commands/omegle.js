/**
 *   ╔════   Copyright 2019 Peter Maguire
 *  ║ ════╗  Created 01/11/2019
 * ╚════ ║   (ocelotbotv5) omegle
 *  ════╝
 */
let waitingMessages = {};
let messageCollectors = {};
module.exports = {
    name: "Omegle",
    usage: "omegle <start/end>",
    categories: ["fun"],
    requiredPermissions: [],
    unwholesome: true,
    hidden: true,
    commands: ["omegle", "om"],
    init: async function(bot){
        bot.client.on("ready", function () {
            bot.rabbit.channel.assertQueue(`omegle-${bot.client.user.id}-${bot.client.shard.ids.join(";")}`, {exclusive: true});
            bot.rabbit.channel.consume(`omegle-${bot.client.user.id}-${bot.client.shard.ids.join(";")}`, async function omegleConsumer(message) {
                try {
                    let msg = JSON.parse(message.content);
                    console.log(msg);
                    switch(msg.type){
                        case "error":
                            if(!msg.data.data || (msg.data.data.error && msg.data.data.error.indexOf("disconnect") === -1)) {
                                let channel = await bot.client.channels.fetch(msg.data.channel);
                                if(channel) {
                                    await channel.sendLang(msg.data.lang, msg.data.data);
                                }
                            }
                            break;
                        case "message":
                            let targetChannel = await bot.client.channels.fetch(msg.data.channel);
                            targetChannel.send("> " + (msg.data.message.replace(/'/, "")));
                            await bot.database.logOmegleMessage(targetChannel.guild ? targetChannel.guild.id : "dm", targetChannel.id, null, msg.data.message);
                            break;
                        case "isOtherServer":
                            (await bot.client.channels.fetch(msg.data)).send("The stranger is another OcelotBOT user!");
                            break;
                        case "disconnected":
                            (await bot.client.channels.fetch(msg.data)).send("The stranger has disconnected.");
                            if(messageCollectors[msg.data]) {
                                messageCollectors[msg.data].stop();
                                delete messageCollectors[msg.data];
                            }
                            break;
                        case "waiting":
                            if(waitingMessages[msg.data])
                                waitingMessages[msg.data].edit("<a:ocelotload:537722658742337557> **Connected to Omegle, looking for match...**");
                            break;
                        case "connected":
                            if(waitingMessages[msg.data]) {
                                waitingMessages[msg.data].delete();
                                delete waitingMessages[msg.data];
                            }
                            const channel = await bot.client.channels.fetch(msg.data);
                            channel.send(`You are now connected to a stranger! Say hi! Start a message with a ${bot.config.get(channel.guild.id, "prefix")} to stop the stranger from seeing it.\n_Please abide by Discord and Omegle ToS. Conversations may be monitored._`);
                            break;
                        default:
                            console.warn(msg);
                    }

                    bot.rabbit.channel.ack(message);
                } catch (e) {
                    bot.raven.captureException(e);
                    bot.logger.error(e);
                }
            });
        });
    },
    run: async function(message, args, bot){
        if(!message.guild)
            return message.replyLang("GENERIC_DM_CHANNEL");

        if(!args[1])
            return message.channel.send(`Usage: ${message.getSetting("prefix")}omegle start/end`);

        if(args[1].toLowerCase() === "start"){
            if(waitingMessages[message.channel.id])
                return message.replyLang("OMEGLE_LOOKING");
            if(messageCollectors[message.channel.id])
                return message.replyLang("OMEGLE_CONNECTED")

            bot.tasks.startTask("omegle", message.channel.id);

            bot.rabbit.queue("omegle", {type: "start", data: message.channel.id}, {replyTo:`omegle-${bot.client.user.id}-${bot.client.shard.ids.join(";")}`});
            waitingMessages[message.channel.id] = await message.replyLang("OMEGLE_START");

            messageCollectors[message.channel.id] = message.channel.createMessageCollector(() => true);

            messageCollectors[message.channel.id].on("collect", function(message){
                if (message.author.bot)return;
                if (!message.content)return;
                if (message.content.startsWith(message.getSetting("prefix")))return;
                if(waitingMessages[message.channel.id])return;
                bot.database.logOmegleMessage(message.guild ? message.guild.id : "dm", message.channel.id, message.author.id, message.cleanContent);
                bot.rabbit.queue("omegle", {type: "message", data: {channel: message.channel.id, message: message.cleanContent.replace(/'/g, "")}}, {replyTo:`omegle-${bot.client.user.id}-${bot.client.shard.ids.join(";")}`});
            });

            messageCollectors[message.channel.id].on("end", function(){
                bot.tasks.endTask("omegle", message.channel.id);
            });

        }else if(args[1].toLowerCase() === "end" || args[1].toLowerCase() === "stop"){
            if(waitingMessages[message.channel.id]) {
                waitingMessages[message.channel.id].delete();
                delete waitingMessages[message.channel.id]
            }
            if(messageCollectors[message.channel.id]){
                messageCollectors[message.channel.id].stop();
                delete messageCollectors[message.channel.id];
            }

            bot.rabbit.queue("omegle", {type: "end", data: message.channel.id}, {replyTo:`omegle-${bot.client.user.id}-${bot.client.shard.ids.join(";")}`});
            message.replyLang("OMEGLE_END");
        }else{
            if(messageCollectors[message.channel.id])
                return message.replyLang("OMEGLE_USAGE_CONNECTED");
            return message.replyLang("OMEGLE_USAGE");
        }
    }
};
