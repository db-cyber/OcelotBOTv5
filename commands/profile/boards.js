/**
 *   ╔════   Copyright 2019 Peter Maguire
 *  ║ ════╗  Created 21/03/2019
 * ╚════ ║   (ocelotbotv5) boards
 *  ════╝
 */
module.exports = {
    name: "View Boards",
    usage: "boards",
    commands: ["boards", "board"],
    run: async function(message, args, bot){
        const result = await bot.database.getProfileOptions("board");
        let output = "Boards:\n";
        for(let i = 0; i < result.length; i++){
            const background = result[i];
            output += `For **${background.name}**${background.premium ? " (<:ocelotbot:533369578114514945> **Premium**)" : ""}: \nΤype ${args[0]} set board ${background.key}\n`;
        }
        message.channel.send(output);
    }
};