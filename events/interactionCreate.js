const { Events } = require('discord.js');

const executeCommand = async (client, interaction) => {
	const command = client.commands.find(cmd => cmd.data.name == interaction.commandName);

	if (client.state < 3) { return await interaction.reply('Client is still starting'); }
	if (!command) { return client.error('COMMANDS', `Command '${interaction.commandName}' not found!`); }

	try {
		const args = interaction.options.data.length > 0 ? interaction.options.data.map(option => ` \`${option.name}${option.value ? `: ${option.value}` : ''}\``) : '';

		const sub_options = interaction.options.data.map(option => option.options).flat();
		const sub_args = sub_options.length > 0 ? sub_options.map(option => ` \`${option.name}${option.value ? `: ${option.value}` : ''}\``) : '';

		if (command.permission ? !command.permission(interaction, client) : false) {
			if (client.config.Settings.VERBOSE) { client.log('COMMANDS', `${interaction.user} was denied access to run the command \`/${interaction.commandName}\``); }
			return interaction.reply('No Permission!');
		}

		if (client.config.Settings.VERBOSE) {
			await client.log('COMMANDS', `${interaction.user} ran the command \`/${interaction.commandName}\`${args}${sub_args}`);
		}

		await command.execute(interaction, client);
	}

	catch (error) {
		client.error('COMMANDS', error);
	}
};

module.exports = {
	name: Events.InteractionCreate,
	once: false,
	async execute(interaction, client) {
		if (interaction.isChatInputCommand()) { executeCommand(client, interaction); }
	},
};