/**
 *   ╔════   Copyright 2019 Peter Maguire
 *  ║ ════╗  Created 06/09/2019
 * ╚════ ║   (ocelotbotv5) rabbit
 *  ════╝
 */
const amqplib = require('amqplib');
const config = require('config');
module.exports = {
    name: "RabbitMQ",
    init: async function(bot){
        bot.rabbit = {};
        bot.rabbit.connection = await amqplib.connect(config.get("RabbitMQ.host"));
        bot.rabbit.channel = await bot.rabbit.connection.createChannel();
        bot.rabbit.rpcChannel = await bot.rabbit.connection.createChannel();
        bot.rabbit.pubsub = {};
        bot.rabbit.queue = function(name, payload){
            bot.rabbit.channel.assertQueue(name);
            bot.rabbit.channel.addToQueue(name, Buffer.from(JSON.stringify(payload)));
        };
        let replyCount = 0;
        let waitingCallbacks = {};

        bot.rabbit.rpcChannel.assertQueue("reply-"+bot.client.shard.id, {exclusive: true});
        bot.rabbit.rpcChannel.consume("reply-"+bot.client.shard.id, function(msg){
            if(waitingCallbacks[msg.properties.correlationId]){
                waitingCallbacks[msg.properties.correlationId](JSON.parse(msg.content.toString()));
            }
        });

        bot.rabbit.rpc = async function(name, payload){
            return new Promise(function(fulfill){
                bot.rabbit.rpcChannel.assertQueue(name);
                const correlationId = bot.client.shard.id+"-"+(replyCount++);
                bot.rabbit.rpcChannel.sendToQueue(name, Buffer.from(JSON.stringify(payload)), {correlationId, replyTo: "reply-"+bot.client.shard.id});
                waitingCallbacks[correlationId] = fulfill;
            });
        };

        bot.rabbit.emit = async function emit(type, payload){
            let buf = Buffer.from(JSON.stringify(payload));
            if(!bot.rabbit.pubsub[type])
                bot.rabbit.pubsub[type] = await bot.rabbit.createPubsub(type);
            bot.rabbit.pubsub[type].publish(type, '', buf, {appId: "ocelotbot-"+bot.client.shard.id});
        };

        bot.rabbit.createPubsub = async function(name){
            const channel = await bot.rabbit.connection.createChannel();
            channel.assertExchange(name, 'fanout', {'durable': false});
            return channel;
        };

        function getSafeMessage(message){
            return {
                content: message.content,
                createdAt: message.createdAt,
                author: {
                    id: message.author.id,
                    username: message.author.username
                },
                guild: {
                    id: message.guild && message.guild.id,
                    name: message.guild && message.guild.name
                },
                channel: {
                    id: message.channel.id,
                    name: message.channel.name
                }
            }
        }

        bot.bus.on("cacheUser", function(userID, commandCount){
            bot.rabbit.emit("cacheUser", {userID, commandCount});
        });

        bot.bus.on("commandPerformed", function(command, message){
            bot.rabbit.emit("commandPerformed", {
                command,
                message: getSafeMessage(message),
            });
        });

        bot.bus.on("commandRatelimited", function(command, message){
            bot.rabbit.emit("commandRatelimited", {
                command,
                message: getSafeMessage(message),
            });
        });

        bot.client.on("guildCreate", function(guild){
            bot.rabbit.emit("guildCreate", {
                id: guild.id,
                name: guild.name
            });
        });

        bot.client.on("guildDelete", function(guild){
            bot.rabbit.emit("guildDelete", {
                id: guild.id,
                name: guild.name,
                available: guild.available
            });
        });
    }
};