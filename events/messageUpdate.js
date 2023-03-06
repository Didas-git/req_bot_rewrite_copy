const { Events, EmbedBuilder } = require('discord.js');

module.exports = {
	name: Events.MessageUpdate,
	once: false,
	async execute(oldMessage, newMessage, client) {
		if (!oldMessage.channel.name.endsWith('waiting_queue')) return;
		const messages = await oldMessage.channel.messages.fetch().then(queue_messages => queue_messages.last(2));
		if (!messages) return;
		const embeds = messages.reduce((acc, msg) => msg.embeds.length && acc.concat(msg.embeds[0]), []).reverse();
		embeds.forEach(embed => {
			embed.data.description = '';
			embed.data.fields[0].name = embed.data.title;
		});

		const outEmbed = new EmbedBuilder()
			.setTitle('Queue')
			.setColor('e7c200');

		outEmbed.data.fields = [...embeds[0].data.fields, ...embeds[1].data.fields];

		if (!embeds.length) return;
		const sot_leaving = oldMessage.guild.channels.cache.find(channel => channel.name == client.config.Mentions.channels.sot_leaving);
		if (!sot_leaving) return;
		let queue_message = await sot_leaving.messages.fetch().then(leaving_messages => leaving_messages.last());
		if (!queue_message) queue_message = await sot_leaving.send({ embeds: [outEmbed] });
		return queue_message.edit({ embeds: [outEmbed] });
	},
};