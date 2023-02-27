const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, ComponentType, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('admin')
		.setDescription('Developer administration commands!')
		.addSubcommand(option => option
			.setName('restart')
			.setDescription('Restarts the bot'),
		)
		.addSubcommand(option => option
			.setName('update')
			.setDescription('Updates the bot'),
		)
		.addSubcommand(option => option
			.setName('config')
			.setDescription('Manage the config')
			.addStringOption(stringOption => stringOption
				.setName('action')
				.setDescription('What action to perform')
				.setRequired(true)
				.addChoices(
					{ name: 'reload', value: 'reload' },
					{ name: 'edit', value: 'edit' },
				),
			),
		),

	permission(interaction, client) {
		const isOwner = client.config.OWNERS.includes(interaction.user.id);
		const isManager = interaction.member.roles.cache.some(role => client.config.MANAGER_ROLE_NAMES.includes(role.name));

		return isOwner || isManager;
	},


	async execute(interaction, client) {
		switch (interaction.options.getSubcommand()) {
		case 'restart': {
			interaction.reply('Restarting!');
			client.restart(client);
			break;
		}

		case 'update': {
			await interaction.deferReply();
			const shell = require('shelljs');
			shell.cd(client.root);

			const outputs = [shell.exec('git stash pop', { silent: true }), shell.exec(`git pull ${client.build['repository']['url']}`, { silent: true })];
			outputs.forEach(async ({ stdout, stderr }) => {
				if (stdout) { client.terminal(stdout); }
				if (stderr && stderr != 'No stash entries found.\n') { client.terminal(stderr);}

				if (stdout == 'Already up to date.\n') { interaction.editReply('No updates available.'); }
				if (stdout.includes('changed')) {
					// Save interaction to provide feedback
					require(client.root + '/modules/updateHelper.js').set(interaction);

					await interaction.editReply('Updated! Restarting...');
					client.restart(client);
				}
			});
			break;
		}

		case 'config': {
			const action = interaction.options.getString('action');
			switch (action) {

			case 'reload': {
				delete require.cache[require.resolve(client.root + '/config.json')];
				client.config = require(client.root + '/config.json');
				client.log('CONFIG', 'Configuration file reloaded');
				await interaction.reply('Config reloaded');
				break;
			}

			case 'edit': {
				selectConfigOption(interaction, client.config, await interaction.deferReply({ ephemeral: true }), [], client);
				break;
			}
			}
		}
		}
	},
};

async function selectConfigOption(interaction, option, message, path, client) {
	const options = Object.keys(option).map(key => {
		const value = JSON.stringify(option[key]);
		return {
			label: key,
			description: value.length > 50 ? `${value.slice(0, 46)} ...` : value.slice(0, 50),
			value: key,
		};
	});

	const components = new ActionRowBuilder()
		.addComponents(
			new StringSelectMenuBuilder()
				.setCustomId('key')
				.setPlaceholder('Choose a key to modify')
				.addOptions(
					options,
				),
		);

	await interaction.editReply({ components: [components], ephemeral: true });
	message.awaitMessageComponent({ componentType: ComponentType.StringSelect, time: 30000 })
		.then(async componentInteraction => {
			await interaction.deleteReply();
			const type = typeof option[componentInteraction.values[0]];
			path.push(Object.keys(option).find(key => option[key] == option[componentInteraction.values[0]]));
			if (type !== 'array' && type !== 'object') { return editConfigOption(componentInteraction, option[componentInteraction.values[0]], option, path, client); }
			await componentInteraction.deferReply({ ephemeral: true });
			selectConfigOption(componentInteraction, option[componentInteraction.values[0]], message, path, client);
		})
		.catch(e => client.error('ADMIN', e));
}

async function editConfigOption(interaction, option, optionParent, path, client) {
	const key = Object.keys(optionParent).find(optionKey => optionParent[optionKey] == option);

	const modal = new ModalBuilder()
		.setCustomId('configEditor')
		.setTitle(key);

	const textComponent = new TextInputBuilder()
		.setCustomId('configText')
		.setLabel(`Current: ${option.toString()}`)
		.setPlaceholder(option.toString())
		.setStyle(TextInputStyle.Paragraph);

	const actionRow = new ActionRowBuilder().addComponents(textComponent);

	modal.addComponents(actionRow);

	interaction.showModal(modal);
	interaction.awaitModalSubmit({ time: 300000 })
		.then(async modalInteraction => {
			const input = modalInteraction.fields.getTextInputValue('configText');
			let newOption = option;
			switch (typeof option) {
			default:
				newOption = input.toString();
				break;

			case 'boolean': {
				if (input.toLowerCase() != 'true' && input.toLowerCase() != 'false') {
					await modalInteraction.reply({ content: 'Invalid input, expected \'Boolean\'', ephemeral: true });
					break;
				}

				newOption = input.toLowerCase() == 'true' ? true : false;
				break;
			}

			case 'number': {
				if (isNaN(input)) {
					await modalInteraction.reply({ content: 'Invalid input, expected \'Number\'', ephemeral: true });
					break;
				}

				newOption = Number(input);
				break;
			}
			}

			if (newOption == option) { return; }

			const textContent = `**${key}** changed from \`\`\`js\n${option}\n\`\`\` to \`\`\`js\n${newOption}\n\`\`\``;
			eval('client._config.' + path.join('.') + '= newOption');
			await require('fs').writeFile(client.root + '/config.json', JSON.stringify(client._config, null, '\t'), e => {
				if (!e) { return; }
				client.error('CONFIG', e);
			});
			await modalInteraction.reply({ content: textContent, ephemeral: true });

			delete require.cache[require.resolve(client.root + '/config.json')];
			client.config = require(client.root + '/config.json');
			client.log('CONFIG', 'Configuration file reloaded due to modification');
		})
		.catch(e => {
			if (e.reason == 'time') { return; }
			console.error(e);
		});
}