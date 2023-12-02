const { Events } = require('discord.js');

const cooldowns = new Map();

const executeCommand = async (client, interaction) => {
	const command = client.commands.find(cmd => cmd.data.name == interaction.commandName);

	// if (client.state < 3) { return await interaction.reply('Client is still starting'); }
	if (!command) { return client.error('COMMANDS', `Command '${interaction.commandName}' not found!`); }

	try {
		const args = interaction.options.data.length > 0 ? interaction.options.data.map(option => ` \`${option.name}${option.value ? `: ${option.value}` : ''}\``) : '';

		const sub_options = interaction.options.data.map(option => option.options).flat();
		const sub_args = sub_options.length > 0 ? sub_options.map(option => ` \`${option.name}${option.value ? `: ${option.value}` : ''}\``) : '';

		if (command.permission ? !command.permission(interaction, client) : false) {
			if (client.config.Settings.VERBOSE) { client.log('COMMANDS', `${interaction.user} was denied access to run the command \`/${interaction.commandName}\``); }
			return interaction.reply('No Permission!');
		}

		if (command.cooldown_skip) {
			cooldowns.delete(command.data.name);
			delete command.cooldown_skip;
		}

		if (cooldowns.has(command.data.name)) return interaction.reply('Woah, slow down there, you\'re going too fast!');

		if (client.config.Settings.VERBOSE) {
			await client.log('COMMANDS', `${interaction.user} ran the command \`/${interaction.commandName}\`${args}${sub_args}`);
		}

		if (command.cooldown) cooldowns.set(command.data.name, true);
		await command.execute(interaction, client);
		setTimeout(() => cooldowns.delete(command.data.name), command.cooldown);
	}

	catch (error) {
		client.error('COMMANDS', error);
		console.error(error);
	}
};

module.exports = {
	name: Events.InteractionCreate,
	once: false,
	async execute(interaction, client) {
		if (interaction.isChatInputCommand()) { executeCommand(client, interaction); }
	},
};