const { ChannelType } = require('discord.js');

module.exports = (client) => {
	client.sota_applicators = new Map();
	client.guilds.cache.forEach(guild => client.sota_applicators.set(guild.id, new SotaApplicator(client, guild)));
};

class SotaApplicator {
	constructor(client, guild) {
		this.client = client;
		this.guild = guild;

		setInterval(() => this.apply(), 1000 * 60 * 10);
	}

	getMembers() {
		const categories = this.guild.channels.cache.filter(channel => channel.type === ChannelType.GuildCategory && channel.name.toLowerCase().includes('sot alliance '));
		const members = categories.reduce((catAcc, category) => {
			const voice_channels = category.children.cache.filter(channel => channel.type === ChannelType.GuildVoice);
			const category_members = voice_channels.reduce((vcAcc, channel) => {
				const channel_members = channel.members.map(member => member);
				return [...vcAcc, ...channel_members];
			}, []);

			return [...catAcc, ...category_members];
		}, []);

		return members;
	}

	apply() {
		const members = this.getMembers();
		members.forEach(member => this.client.bucket.queue(async () => {
			const number = member.voice.channel?.parent.name.match(/\d+/)[0];
			if (!number) return;
			const sota_role = member.guild.roles.cache.find(role => role.name === `SOTA-${number}`);
			if (!sota_role) return;
			if (member.roles.cache.has(sota_role.id)) return;
			member.roles.add(sota_role);
		}));
	}
}