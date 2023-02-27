const { Collection } = require('discord.js');

module.exports = (({ client, fs }) => {
	const commandDir = client.root + '/commands';

	client.commands = new Collection();
	const commandFiles = fs.readdirSync(commandDir).filter(file => file.endsWith('.js'));

	commandFiles.forEach(file => {
		const command = require(`${commandDir}/${file}`);

		if (!('data' in command && 'execute' in command)) {
			console.warn(`[COMMANDS] The command at ${commandDir}/${file} is missing a required "data" or "execute" property.`);
		}

		client.commands.set(command.data.name, { data: command.data, execute: command.execute, permission: command.permission, cooldown: command.cooldown });
	});
});