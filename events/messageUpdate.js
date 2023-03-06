const { Events } = require('discord.js');

module.exports = {
	name: Events.MessageUpdate,
	once: false,
	async execute(oldMessage, newMessage, client) {
		if (!oldMessage.channel.name.endsWith('waiting_queue')) return;
		const messages = await oldMessage.channel.messages.fetch().then(queue_messages => queue_messages.array().slice(-2));
		if (!messages) return;
		const embeds = messages.reduce((acc, msg) => msg.embeds.length && acc.concat(msg.embeds[0]), []);
		if (!embeds.length) return;
		const sot_leaving = oldMessage.guild.channels.cache.find(channel => channel.name == client.config.Mentions.channels.sot_leaving);
		if (!sot_leaving) return;
		let queue_message = await sot_leaving.messages.fetch().then(leaving_messages => leaving_messages.first());
		if (!queue_message) queue_message = await sot_leaving.send({ embeds: embeds });
		return queue_message.edit({ embeds: embeds });
	},
};