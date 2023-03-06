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
			.setColor('e7c200');

		const officer_role = oldMessage.guild.roles.cache.find(role => role.name == client.config.Mentions.roles.officer);
		const role_member_ids = officer_role.members.map(member => member.id);

		outEmbed.data.fields = [...embeds[0].data.fields, ...embeds[1].data.fields];
		outEmbed.data.fields.forEach(field => field.value = field.value.replace(/`\d+\W+`/gi, '').replace(/<t:\d+:R>/gi, ''));

		outEmbed.data.fields.forEach(field => {
			const split = field.value.split('\n');
			const filtered = split.filter(line => !role_member_ids.some(id => line.includes(id)));
			field.value = filtered.map((line, index) => `\`${index}\`${line}`).join('\n');
		});

		if (!embeds.length) return;
		const sot_leaving = oldMessage.guild.channels.cache.find(channel => channel.name == client.config.Mentions.channels.sot_leaving);
		if (!sot_leaving) return;
		let queue_message = await sot_leaving.messages.fetch().then(leaving_messages => leaving_messages.last());

		const embedContent = '__**What each button means**__\n> :green_circle: **Approve**\n> The member is granted permission to leave the ship immediately.\n> \n> :red_circle: **Cancel**\n> The leaving request is cancelled, if they leave, officers will be notified.\n> \n> :white_circle: **Clear**\n> The member left with a request still pending, click when the spot is filled.\n\n__**What the request colours mean**__\n> :yellow_circle:  **Yellow**\n> There is one leaving request for this specific ship.\n> \n> :orange_circle:  **Amber**\n> There is two leaving requests for this specific ship.\n> \n> :red_circle:  **Red**\n> There is three or more leaving requests for this ship.\n\n*Dummy (officer) requests will not update colour when cleared*';

		if (!queue_message) queue_message = await sot_leaving.send({ content: embedContent, embeds: [outEmbed] });
		return queue_message.edit({ content: embedContent, embeds: [outEmbed] });
	},
};