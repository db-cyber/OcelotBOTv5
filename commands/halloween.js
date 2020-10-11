/**
 *   ╔════   Copyright 2018 Peter Maguire
 *  ║ ════╗  Created 29/11/2018
 * ╚════ ║   (ocelotbotv5) halloween
 *  ════╝
 */
const halloween = new Date("31 October 2020");
module.exports = {
    name: "Halloween Countdown",
    usage: "halloween",
    categories: ["tools", "fun"],
    commands: ["halloween"],
    run: function run(message, args, bot) {
        const diff = (halloween-(new Date()))/1000;
        message.replyLang("HALLOWEEN", {time: bot.util.prettySeconds(diff, message.guild && message.guild.id, message.author.id)});
    }

};