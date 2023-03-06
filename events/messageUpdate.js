const { Events } = require('discord.js');

module.exports = {
	name: Events.MessageUpdate,
	once: false,
	async execute(oldMessage, newMessage, client) {
		if (!oldMessage.channel.name.endsWith('waiting_queue')) return;
		const messages = await oldMessage.channel.messages.fetch({ limit: 2 });
		if (!messages) return;
		const embeds = messages.reduce((acc, msg) => msg.embeds.length && acc.concat(msg.embeds[0]), []);
		if (!embeds.length) return;
		let sot_leaving = oldMessage.guild.channels.cache.find(channel => channel.name == client.config.Mentions.channels.sot_leaving);
		if (!sot_leaving) sot_leaving = await oldMessage.guild.channels.fetch().then(channels => channels.find(channel => channel.name == client.config.Mentions.channels.sot_leaving)).catch(() => null);
		if (!sot_leaving) return;
		const queue_message = await sot_leaving.messages.fetch({ limit: 1 }).then(queue_messages => queue_messages.first()).catch(() => null);
		if (!queue_message) return sot_leaving.send({ embeds: embeds });
		queue_message.edit({ embeds: embeds }).catch(() => null);
	},
};