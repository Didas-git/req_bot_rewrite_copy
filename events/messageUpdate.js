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
			if (!filtered.length) return field.falue = 'Empty';
			field.value = filtered.map((line, index) => `\`${index + 1}\`${line}`).join('\n');
		});

		const keyEmbed = {
			'color': 15188480,
			'fields': [
				{
					'name': 'Button Key',
					'value': '<:green_circle:1082343460100657202> **Approve** - The member can leave immediately\n<:red_circle:1082343460100657202> **Cancel** - The request is cancelled, the user is notified\n<:white_circle:1082343460100657202> **Clear** - They left with an active request, click when filled',
				},
				{
					'name': 'Colour Key',
					'value': '<:yellow_circle:1082343460100657202> **Yellow** - There is one request for this ship\n<:orange_circle:1082343460100657202> **Amber** - There is two requests for this ship\n<:red_circle:1082343460100657202> **Red** - There are 3+ requests for this ship',
				},
			],
			'footer': {
				'text': 'Dummy (officer) request colours will not update when cleared.',
			},
		};

		if (!embeds.length) return;
		const sot_leaving = oldMessage.guild.channels.cache.find(channel => channel.name == client.config.Mentions.channels.sot_leaving);
		if (!sot_leaving) return;
		let queue_message = await sot_leaving.messages.fetch().then(leaving_messages => leaving_messages.last());

		if (!queue_message) queue_message = await sot_leaving.send({ embeds: [keyEmbed, outEmbed] });
		return queue_message.edit({ embeds: [keyEmbed, outEmbed] });
	},
};