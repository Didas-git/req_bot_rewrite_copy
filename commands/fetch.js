const { SlashCommandBuilder, ClientUser, GuildChannel, Role } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('fetch')
		.setDescription('Fetches information!')
		.addUserOption(option => option
			.setName('user')
			.setDescription('What user to fetch'),
		)
		.addUserOption(option => option
			.setName('member')
			.setDescription('What member to fetch'),
		)
		.addChannelOption(option => option
			.setName('channel')
			.setDescription('What channel to fetch'),
		)
		.addStringOption(option => option
			.setName('message')
			.setDescription('What message to fetch'),
		)
		.addRoleOption(option => option
			.setName('role')
			.setDescription('What role to fetch'),
		),

	permission(interaction, client) {
		const isOwner = client.config.OWNERS.includes(interaction.user.id);
		const isManager = interaction.member.roles.cache.some(role => client.config.MANAGER_ROLE_NAMES.includes(role.name));

		return isOwner || isManager;
	},

	async execute(interaction, client) {
		await interaction.deferReply();
		const options = [interaction.options.getUser('member'), interaction.options.getUser('user'), interaction.options.getChannel('channel'), interaction.options.getString('message'), interaction.options.getRole('role')];

		const targets = options.map(target => {
			if (!target) return;
			if (target instanceof ClientUser) {
				try {
					return interaction.guild.members.fetch(target.id);
				}

				catch (e) {
					return client.users.fetch(target.id);
				}
			}
			if (target instanceof GuildChannel) { return interaction.guild.channels.fetch(target.id); }
			if (target.length == 19 && typeof target == 'string') { return interaction.channel.messages.fetch(target); }
			if (target instanceof Role) { return interaction.guild.roles.fetch(target.id); }
		});

		Promise.all(targets).then(responses => {
			responses.forEach(target => {
				if (!target) return;
				interaction.followUp('```json\n' + JSON.stringify(target, null, '\t') + '\n```').catch(e => client.error('FETCH', e));
			});
		});
	},
};