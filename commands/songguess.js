/**
 *   ╔════   Copyright 2018 Peter Maguire
 *  ║ ════╗  Created 05/12/2018
 * ╚════ ║   (ocelotbotv5) songguess
 *  ════╝
 */

let songList = [];
let count = 0;
const path = "/home/peter/nsp";
const config = require('config');
const request = require('request');
const Discord = require('discord.js');
const columnify = require('columnify');
const pasync = require('promise-async');
const fs = require('fs');

let leaveTimeouts = {};

module.exports = {
    name: "Guess The Song",
    usage: "guess [stop/stats]",
    rateLimit: 25,
    categories: ["games", "voice"],
    requiredPermissions: ["CONNECT", "SPEAK"],
    commands: ["guess", "guesssong", "songguess", "namethattune", "quess", "gues"],
    init: async function init(bot){
        bot.logger.log("Loading song list...");

        songList = await bot.database.getSongList();
    },
    run:  async function run(message, args, bot){
        if(args[1] && args[1].toLowerCase() === "stop") {
            if (message.guild.voiceConnection)
                await message.guild.voiceConnection.disconnect();
        }else if(args[1] && args[1].toLowerCase() === "stats") {
            let stats = await bot.database.getGuessStats();
            let output = "**Guess Stats:**\n";
            output += `**${songList.length.toLocaleString()}** available songs.\n`;
            output += `**${stats.totalGuesses.toLocaleString()}** total guesses by **${stats.totalUsers}** users.\n`;
            output += `**${stats.totalCorrect.toLocaleString()}** (**${parseInt((stats.totalCorrect / stats.totalGuesses) * 100)}%**) correct guesses.\n`;
            output += `Average of **${bot.util.prettySeconds(stats.averageTime / 1000)}** until a correct guess.\n`;
            message.channel.send(output);
        }else if(args[1] && args[1].toLowerCase() === "leaderboard"){

            let leaderboardData;
            if(args[2] && args[2].toLowerCase() === "monthly"){
                leaderboardData = await bot.database.getGuessMonthlyLeaderboard();
            }else if(args[2] && args[2].toLowerCase() === "server" && message.guild) {
                leaderboardData = await bot.database.getGuessServerLeaderboard(message.guild.members.keyArray());
            }else{
                leaderboardData = await bot.database.getGuessLeaderboard();
            }

            const unknownUserKey = await bot.lang.getTranslation(message.guild ? message.guild.id : "322032568558026753", "TRIVIA_UNKNOWN_USER");
            let i = 0;
            let data = [];
            let position = -1;

            await pasync.eachSeries(leaderboardData, async function processLeaderboard(entry, cb){
                i++;
                if(entry.user === message.author.id){
                    position = "#"+i;
                    if(i > 10){
                        cb();
                        return;
                    }
                }
                if(i <= 10)
                    try {
                        const user = bot.client.users.get(entry.user);
                        data.push({
                            "#": i,
                            "user": user ? `${user.username}#${user.discriminator}` : `${unknownUserKey} ${entry.user}`,
                            "Correct": entry.points,
                            "Total": entry.total,
                        });
                    }catch(e){
                        bot.logger.error("Error processing leaderboard entry");
                        bot.logger.error(e);
                    }finally{
                        cb();
                    }
                else cb();
            });
            message.channel.send(`You are **${position}** out of **${leaderboardData.length}** total players${args[2] && args[2].toLowerCase() === "monthly" ? " this month." : "."}\n\`\`\`yaml\n${columnify(data)}\n\`\`\``);
        }else if(songList.length === 0){
            message.channel.send("OcelotBOT is currently in a limited functionality mode, which disables this command.");
        }else if(!message.guild){
            message.replyLang("GENERIC_DM_CHANNEL");
        }else if(!message.guild.available){
            message.replyLang("GENERIC_GUILD_UNAVAILABLE");
        }else if(!message.member.voiceChannel) {
            message.replyLang("VOICE_NO_CHANNEL");
        }else if(message.member.voiceChannel.full){
            message.replyLang("VOICE_FULL_CHANNEL");
        }else if(!message.member.voiceChannel.joinable) {
            message.replyLang("VOICE_UNJOINABLE_CHANNEL");
        }else if(!message.member.voiceChannel.speakable){
            message.replyLang("VOICE_UNSPEAKABLE_CHANNEL");
        }else if(runningGames[message.guild.id] && runningGames[message.guild.id].channel.id !== message.member.voiceChannel.id) {
            message.channel.send(`There is already a game running in ${runningGames[message.guild.id].channel.name}!`);
        }else if(message.guild.voiceConnection && !leaveTimeouts[message.member.voiceChannel.id] && message.getSetting("songguess.disallowReguess")){
            message.channel.send("I'm already in a voice channel doing something.");
        }else{
            try {
                bot.logger.log("Joining voice channel "+message.member.voiceChannel.name);

                if(message.guild.voiceConnection && !leaveTimeouts[message.member.voiceChannel.id])
                    await message.guild.voiceConnection.disconnect();

                let connection = await message.member.voiceChannel.join();
                doGuess(message.member.voiceChannel, message, connection, bot);
            }catch(e){
                bot.raven.captureException(e);
                bot.logger.log(e);
                message.replyLang("GENERIC_ERROR");
            }
        }
    },
    test: function(test){
        test('songguess no guild', function(t){
            const message = {
                channel: {
                    send: function(message){
                        t.is(message, "This cannot be used in a DM channel.")
                    }
                }
            };
            module.exports.run(message);
        });
        test('songguess guild unavailable', function(t){
            const message = {
                channel: {
                    send: function(message){
                        t.is(message, "The guild is unavailable due to discord issues. Try again later.")
                    }
                },
                guild: {
                    available: false
                }
            };
            module.exports.run(message);
        });
        test('songguess no voice channel', function(t){
            const message = {
                channel: {
                    send: function(message){
                        t.is(message, "You need to be in a voice channel to use this command.")
                    }
                },
                guild: {
                    available: true
                },
                member: {}
            };
            module.exports.run(message);
        });
        test('songguess voice channel full', function(t){
            const message = {
                channel: {
                    send: function(message){
                        t.is(message, "That voice channel is full.")
                    }
                },
                guild: {
                    available: true
                },
                member: {
                    voiceChannel: {
                        full: true
                    }
                }
            };
            module.exports.run(message);
        });
        test('songguess voice unjoinable', function(t){
            const message = {
                channel: {
                    send: function(message){
                        t.is(message, "I don't have permission to join the voice channel you're currently in.")
                    }
                },
                guild: {
                    available: true
                },
                member: {
                    voiceChannel: {
                        full: false,
                        joinable: false
                    }
                }
            };
            module.exports.run(message);
        });
        test('songguess voice unspeakable', function(t){
            const message = {
                channel: {
                    send: function(message){
                        t.is(message, "I don't have permission to speak in the voice channel you're currently in.")
                    }
                },
                guild: {
                    available: true
                },
                member: {
                    voiceChannel: {
                        full: false,
                        joinable: true,
                        speakable: false
                    }
                }
            };
            module.exports.run(message);
        });
        test('songguess', function(t){
            const message = {
                channel: {
                    send: function(message){
                        t.fail();
                    }
                },
                guild: {
                    available: true,
                    voiceConnection: {
                        disconnect: function(){
                            t.pass();
                        }
                    }
                },
                member: {
                    voiceChannel: {
                        full: false,
                        joinable: true,
                        speakable: true,
                        name: "Channel",
                        join: function(){
                            t.pass();
                            return {
                                playFile: function(){
                                    t.pass();
                                    return {
                                        on: function(end, callback){
                                            t.is(end, "end");
                                            callback();
                                        }
                                    }
                                },
                                disconnect: function(){
                                    t.pass();
                                }
                            }
                        }
                    }
                }
            };
            const bot = {
                logger: {
                    log: function(message){
                        console.log(message);
                    }
                },
                util: {
                    arrayRand: function(array){
                        return array[0];
                    }
                },
                raven: {
                    captureException: function(){
                        t.fail();
                    }
                }
            };
            module.exports.run(message, null, bot);
        });
    }
};

let timeouts = [];

let runningGames = [];

function doGuess(voiceChannel, message, voiceConnection, bot){
    try {
        if(leaveTimeouts[voiceChannel.id])
            clearTimeout(leaveTimeouts[voiceChannel.id]);
        if (voiceChannel.members.size <= 1)
            return voiceConnection.disconnect();
        if(timeouts[voiceChannel.id])
            return;
        if(runningGames[voiceChannel.id])
            return;

        runningGames[voiceChannel.id] = voiceConnection;

        const song = songList[count++ % songList.length];
        const file = song.path;
        const now = new Date();
        const artistName = song.name;
        const title = artistName + " - " + song.title;
        const answer = song.title.toLowerCase().replace(/\W/g, "").replace(/[\(\[].*[\)\]]/, "");
        const artist = artistName.toLowerCase().replace(/\W/g, "").replace(/[\(\[].*[\)\]]/, "");
        bot.logger.log("Title is " + answer);
        message.replyLang("SONGGUESS", {minutes: message.getSetting("songguess.seconds") / 60});
        const dispatcher = voiceConnection.playFile(file, {seek: message.getSetting("songguess.seek")});
        let won = false;
        let collector = message.channel.createMessageCollector(() => true, {time: message.getSetting("songguess.seconds") * 1000});
        dispatcher.on("end", function fileEnd() {
            bot.logger.log("Finished playing");
            if (!won) {
                if (collector) {
                    collector.stop();
                }
                //setTimeout(doGuess, 1000, voiceChannel, message, voiceConnection, bot);
            }
        });
        dispatcher.on("error", function fileError(err) {
            bot.raven.captureException(err);
            console.log(err);
            message.replyLang("GENERIC_ERROR");
        });


        collector.on('collect', async function collect(message) {
            if (message.author.id === "146293573422284800") return;
            if(bot.banCache.user.indexOf(message.author.id) > -1)return;
            const guessTime = new Date();
            const strippedMessage = message.cleanContent.toLowerCase().replace(/\W/g, "");
            console.log(strippedMessage);
            if (message.getSetting("songguess.showArtistName") === "true" && strippedMessage.indexOf(answer) > -1 || (strippedMessage.length >= (answer.length / 3) && answer.indexOf(strippedMessage) > -1)) {

                let embed = new Discord.RichEmbed();
                embed.setColor("#77ee77");
                embed.setTitle(`${message.author.username} wins!`);
                embed.setThumbnail(`https://unacceptableuse.com/petify/album/${song.album}`);
                embed.setDescription(`The song was **${title}**`);
                embed.addField(":stopwatch: Time Taken", bot.util.prettySeconds((guessTime - now) / 1000));
                let fastestTime = (await bot.database.getFastestSongGuess(title))[0];
                if(fastestTime && fastestTime.elapsed){
                    embed.addField(":timer: Fastest Time", bot.util.prettySeconds(fastestTime.elapsed / 1000));
                }

                message.channel.send(message.author, embed);

                let newOffset = guessTime-now;
                if(fastestTime && fastestTime.elapsed && fastestTime.elapsed > newOffset){
                    message.channel.send(`:tada: You beat the previous fastest time for that song!`);
                }

               // message.replyLang("SONGGUESS_WIN", {id: message.author.id, seconds: bot.util.prettySeconds((guessTime - now) / 1000), title});
                won = true;
                if (collector)
                    collector.stop();


                let totalGuesses = await bot.database.getTotalCorrectGuesses(message.author.id);

                if(totalGuesses && totalGuesses[0] && totalGuesses[0]['COUNT(*)']) {
                    bot.badges.updateBadge(message.author, "guess", totalGuesses[0]['COUNT(*)'] + 1, message.channel);
                }
            } else if (strippedMessage.indexOf(artist) > -1 || (strippedMessage.length >= (artist.length / 3) && artist.indexOf(strippedMessage) > -1)) {
                message.replyLang("SONGGUESS_ARTIST", {id: message.author.id, artist: artistName});
            }
            bot.database.addSongGuess(message.author.id, message.channel.id, message.guild.id, message.cleanContent, title, won, guessTime - now);
        });
        collector.on('end', function collectorEnd() {
            console.log("Collection Ended");
            if(!won)
                message.replyLang("SONGGUESS_OVER", {title});
            if(timeouts[voiceChannel.id]) {
                bot.logger.log("Clearing timeout");
                clearTimeout(timeouts[voiceChannel.id])
            }
            dispatcher.end();
            if(message.getSetting("guess.repeat")) {
                timeouts[voiceChannel.id] = setTimeout(function () {
                    delete timeouts[voiceChannel.id];
                    delete runningGames[voiceChannel.id];
                    doGuess(voiceChannel, message, voiceConnection, bot);
                }, 2000);
            }else{
                delete runningGames[voiceChannel.id];
                if(leaveTimeouts[voiceChannel.id])
                    clearTimeout(leaveTimeouts[voiceChannel.id]);
                leaveTimeouts[voiceChannel.id] = setTimeout(function leaveTimeout(){
                    bot.logger.log(`Leaving voice channel ${voiceChannel.name} (${voiceChannel.id})`);
                    voiceConnection.disconnect();
                    delete leaveTimeouts[voiceChannel.id];
                }, parseInt(message.getSetting("songguess.leaveTimeout")));
            }
        });
    }catch(e){
        if(voiceConnection)
            voiceConnection.disconnect();
        if(message)
            message.replyLang("GENERIC_ERROR");
        console.log(e);

    }
}