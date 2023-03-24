const { SlashCommandBuilder, ChannelType, WebhookClient, EmbedBuilder, TextInputBuilder, TextInputStyle, ModalBuilder, ActionRowBuilder } = require('discord.js');

const webhook = new WebhookClient({ id: '1088162049890193438', token: 'UZ72NS2xbI-AsJIUo8p3RcTa8VgqUp6kIcNHnkPYp_ZUvajBNqMxwJNtoaOTejJ6JlCb' });

const regions_to_emojis = {
	'eu': ':flag_eu:',
	'us': ':flag_us:',
	'au': ':flag_au:',
};

module.exports = {
	data: new SlashCommandBuilder()
		.setName('alliance')
		.setDescription('Alliance administration commands.')
		.addSubcommand(option => option
			.setName('create')
			.setDescription('Create an alliance server.')
			.addStringOption(stringOption =>
				stringOption.setName('region')
					.setDescription('What region is the server in?')
					.setRequired(true)
					.addChoices(
						{ name: 'United States', value: 'us' },
						{ name: 'Europe', value: 'eu' },
						{ name: 'Australia', value: 'au' },
					),
			),
		)
		.addSubcommand(option => option
			.setName('remove')
			.setDescription('Remove an alliance server.')
			.addNumberOption(numberOption => numberOption
				.setName('number')
				.setDescription('What number server to remove?')
				.setRequired(true),
			)
			.addStringOption(stringOption =>
				stringOption.setName('reason')
					.setDescription('Why are you removing this server?')
					.setRequired(true)
					.addChoices(
						{ name: 'No longer able to fill spots', value: 'Natural' },
						{ name: 'Rare issue (crash / maintenance)', value: 'Rare' },
						{ name: 'The server is too laggy, unplayable', value: 'Lag' },
						{ name: 'Rogue player within the alliance', value: 'Rogue' },
						{ name: 'Hostile player outside the alliance', value: 'Hostile' },
						{ name: 'Alliance dropped below four ships', value: 'Lost Ship' },
					),
			),
		)
		.addSubcommand(option => option
			.setName('lock')
			.setDescription('Lock an alliance server.')
			.addNumberOption(numberOption => numberOption
				.setName('number')
				.setDescription('What number server to lock?')
				.setRequired(true),
			),
		)
		.addSubcommand(option => option
			.setName('unlock')
			.setDescription('Unlock an alliance server.')
			.addNumberOption(numberOption => numberOption
				.setName('number')
				.setDescription('What number server to unlock?')
				.setRequired(true),
			),
		)
		.addSubcommand(option => option
			.setName('info')
			.setDescription('Display uptime and region of an alliance server')
			.addNumberOption(numberOption => numberOption
				.setName('number')
				.setDescription('What number server to display?'),
			)),

	cooldown: 15000,

	permission(interaction, client) {
		const isOwner = client.config.OWNERS.includes(interaction.user.id);
		const isManager = interaction.member.roles.cache.some(role => client.config.MANAGER_ROLE_NAMES.includes(role.name));
		const isSupervisor = interaction.member.roles.cache.some(role => client.config.SUPERVISOR_ROLE_NAMES.includes(role.name));
		const isStaff = interaction.member.roles.cache.some(role => client.config.STAFF_ROLE_NAMES.includes(role.name));

		switch (interaction.options.getSubcommand()) {

		case 'create': {
			return (isOwner || isManager || isSupervisor || isStaff);
		}

		case 'remove': {
			return (isOwner || isManager || isSupervisor || isStaff);
		}

		case 'lock': {
			return (isOwner || isManager || isSupervisor);
		}

		case 'unlock': {
			return (isOwner || isManager || isSupervisor);
		}

		default: {
			return true;
		}

		}
	},

	async execute(interaction, client) {
		if (interaction.channel.name.match(/^server\d+_/) && interaction.options.getSubcommand() != 'info') return interaction.editReply('Please run this in a commands channel.');

		switch (interaction.options.getSubcommand()) {

		case 'create': {
			createServer(interaction, client);
			break;
		}

		case 'remove': {
			removeServer(interaction, client);
			break;
		}

		case 'lock': {
			lockServer(interaction);
			break;
		}

		case 'unlock': {
			unlockServer(interaction);
			break;
		}

		case 'info': {
			allianceInfo(interaction, client);
			this.cooldown_skip = true;
			break;
		}

		}
	},
};

async function allianceInfo(interaction, client) {
	const collection = client.mongo.collection('servers');

	const server = interaction.options.getNumber('number');
	const userVoiceChannel = interaction.member.voice.channel;
	let allianceNumber = userVoiceChannel?.name.match(/(\d+)- \[/);
	if (allianceNumber) allianceNumber = allianceNumber[1];

	const number = (server) ? server : allianceNumber;
	const category = interaction.guild.channels.cache.find(channel => channel.type === ChannelType.GuildCategory && channel.name.includes(`SoT Alliance ${number}`));
	if (!category) return interaction.reply('Could not find an alliance server.');

	const entry = await collection.findOne({ current_number: Number(number) }, { projection: { creation: 1 } });
	if (!entry) return interaction.reply('Could not find an alliance server.');

	const uptime = Math.floor((Date.now() - entry.creation.time) / 1000 / 60 / 60) + 'h ' + (Math.floor((Date.now() - entry.creation.time) / 1000 / 60) % 60 + 'm').padStart(3, '0');
	const server_embed = new EmbedBuilder()
		.setTitle('Requiem - SoT Alliance Server # ' + category.name.match(/\d+/)[0])
		.setColor('e7c200')
		.addFields({
			name: 'Region',
			value: regions_to_emojis[entry.creation.region],
			inline: true,
		})
		.addFields({
			name: 'Creation Time',
			value: `<t:${Math.floor(new Date(entry.creation.time) / 1000)}:f>`,
			inline: true,
		})
		.addFields({
			name: 'Uptime',
			value: uptime,
			inline: true,
		});

	interaction.reply({ embeds: [server_embed] });
}

function getNextServer(interaction) {
	const categories = getCategories(interaction);
	const server_numbers = categories.map(category => category.server_number).sort();

	let missing_number = 0;
	for (let n = 1; n <= server_numbers.length + 1; n++) {
		if (server_numbers.indexOf(n.toString()) === -1) {
			missing_number = n;
			break;
		}
	}

	return Number(missing_number);
}

function getAllianceCategory(interaction) {
	const category = interaction.guild.channels.cache.find(channel => channel.type === ChannelType.GuildCategory && channel.name.toLowerCase().includes('sot alliances'));
	return category;
}

async function createRole(interaction, server_number) {
	const bucket = interaction.client.bucket;
	const oldRole = interaction.guild.roles.cache.find(role => role.name == `SOTA-${server_number}`);
	if (oldRole) return oldRole;

	return await bucket.queue(async () => await interaction.guild.roles.create({
		name: `SOTA-${server_number}`,
		reason: `Creating alliance server (${interaction.member.displayName} - ${interaction.member.id})`,
		permissions: [],
	}));
}

function parsePermissions(interaction, sota_role) {
	const permission = Object.keys(interaction.client.config.PERMISSION_GROUPS).map(key => {
		return {
			[key]: (() => {
				return interaction.client.config.PERMISSION_GROUPS[key].map(groupItem => {
					const localGroupItem = { ...groupItem };
					if (localGroupItem.id == '@everyone') localGroupItem.id = interaction.guild.id;
					if (localGroupItem.id == '@alliance') localGroupItem.id = sota_role.id;
					if (isNaN(localGroupItem.id)) localGroupItem.id = interaction.guild.roles.cache.find(role => role.name == localGroupItem.id).id;
					return localGroupItem;
				});
			})(),
		};
	});

	return permission.reduce((obj, item) => {
		obj[Object.keys(item)[0]] = item[Object.keys(item)[0]];
		return obj;
	}, {});
}

async function createServerCategory(interaction, server_number) {
	const bucket = interaction.client.bucket;
	const category = await bucket.queue(async () => await interaction.guild.channels.create({
		name: `━━━[ SoT Alliance ${server_number} ]━━━`,
		type: ChannelType.GuildCategory,
		reason: `Creating alliance server (${interaction.member.displayName} - ${interaction.member.id})`,
		permissionOverwrites: [
			{
				id: interaction.guild.roles.cache.find(role => role.name == 'SoT Officer').id,
				allow: ['ViewChannel', 'ManageMessages'],
			},
			{
				id: interaction.guild.roles.cache.find(role => role.name == 'Moderator').id,
				allow: ['ViewChannel', 'ManageMessages', 'ManageChannels'],
			},
			{
				id: interaction.guild.id,
				allow: ['ViewChannel'],
				deny: ['Connect', 'UseEmbeddedActivities'],
			},
		],
	}));

	await category.setPosition(getAllianceCategory(interaction).position + Number(server_number));

	return category;
}

async function createChannels(interaction, server_number, category, permissions) {
	const bucket = interaction.client.bucket;
	return await Promise.all(interaction.client.config.SOTA_TEMPLATE.map(async (channel, index) => {
		return bucket.queue(async () => {
			await category.children.create({
				name: channel.name.replace('${N}', server_number),
				type: (channel.type == 'text') ? ChannelType.GuildText : ChannelType.GuildVoice,
				permissionOverwrites: permissions[channel.permission_group],
				reason: `Creating alliance server (${interaction.member.displayName} - ${interaction.member.id})`,
			});
		}, { weight: 1000 + index });
	}));
}

async function createServer(interaction, client) {
	await interaction.reply('Determine server number...');
	const number = getNextServer(interaction);

	await interaction.editReply('Create role...');
	const role = await createRole(interaction, number);

	await interaction.editReply('Parse permissions...');
	const permissions = parsePermissions(interaction, role);

	await interaction.editReply('Create category...');
	const category = await createServerCategory(interaction, number.toString());

	await interaction.editReply('Create channels...');
	await createChannels(interaction, number, category, permissions);

	await interaction.editReply('Attach status refresher...');
	client.status_updaters.get(interaction.guild.id).add(category);

	await interaction.editReply('Post embeds...');
	await postEmbeds(interaction, category);

	const region = interaction.options.getString('region');
	const collection = client.mongo.collection('servers');
	await collection.insertOne({
		original_number: number,
		current_number: number,
		creation: {
			time: new Date(),
			region,
			officer: interaction.member.id,
		},
	});

	await interaction.editReply('Finished creating server!');
}

async function postEmbeds(interaction, category) {
	const bucket = interaction.client.bucket;

	const { children: channels } = category;
	const config = interaction.client.config;
	const chat_channel = channels.cache.find(channel => channel.name.toLowerCase().includes('_chat'));
	const emissary_channel = channels.cache.find(channel => channel.name.toLowerCase().includes('_emissary'));
	const leaving_channel = channels.cache.find(channel => channel.name.toLowerCase().includes('_leaving'));

	const server_embed = new EmbedBuilder()
		.setTitle('Requiem - SoT Alliance Server # ' + category.name.match(/\d+/)[0])
		.setColor('e7c200')
		.addFields({
			name: 'Region',
			value: regions_to_emojis[interaction.options.getString('region')],
			inline: true,
		})
		.addFields({
			name: 'Creation Time',
			value: `<t:${Math.floor(Date.now() / 1000)}:f>`,
			inline: true,
		});

	const chat_embeds = [config.Embeds.sell_rotation, config.Embeds.best_practices, server_embed];
	const emissary_embed = [config.Embeds.emissary];
	const leaving_embed = [config.Embeds.leaving];

	await bucket.queue(async () => await chat_channel.send({ embeds: chat_embeds }).then(msg => msg.pin()), { weight: 1000 });
	await bucket.queue(async () => await emissary_channel.send({ embeds: emissary_embed }).then(msg => msg.pin()), { weight: 1000 });
	await bucket.queue(async () => await leaving_channel.send({ embeds: leaving_embed }).then(msg => msg.pin()), { weight: 1000 });
}

async function removeServer(interaction, client) {
	const detailsModal = new ModalBuilder()
		.setTitle('Shutdown Details')
		.setCustomId('shutdownDetails');

	const detailsText = new TextInputBuilder()
		.setCustomId('shutdownText')
		.setLabel('Additional Details')
		.setPlaceholder('Please provide additional details, if any. (eg. server became to laggy, multiple loot inspections carried out - officers involved in shutdown: Bill, Joe)')
		.setStyle(TextInputStyle.Paragraph)
		.setRequired(false);

	const actionRow = new ActionRowBuilder()
		.addComponents(detailsText);

	detailsModal.addComponents(actionRow);

	await interaction.showModal(detailsModal);
	const filter = (modalInteraction) => modalInteraction.customId === 'shutdownDetails';
	interaction.awaitModalSubmit({ filter, time: 300_000 }).then(async modalInteraction => {
		const shutdownDetails = modalInteraction.fields.getTextInputValue('shutdownText');
		const bucket = interaction.client.bucket;
		const collection = client.mongo.collection('servers');

		await modalInteraction.reply('Find server...');
		const number = interaction.options.getNumber('number');
		const delete_category = await getServer(interaction, number);
		if (!delete_category) return modalInteraction.editReply(`Server \`${number}\` does not exist!`);
		const old_position = delete_category.position;

		await modalInteraction.editReply('Check if voice channels empty...');
		const voice_channels = delete_category.children.cache.filter(channel => channel.type == ChannelType.GuildVoice);
		const voice_channels_empty = voice_channels.every(channel => channel.members.size == 0);
		if (!voice_channels_empty) return modalInteraction.editReply('There are still members in the ship channels!');

		await modalInteraction.editReply('Delete channels...');
		await Promise.all(delete_category.children.cache.map(child => bucket.queue(async () => await child.delete(`Removing alliance server (${interaction.member.displayName} - ${interaction.member.id})`), { weight: 1000 })));

		await bucket.queue(async () => await delete_category.delete(`Removing alliance server (${interaction.member.displayName} - ${interaction.member.id})`), { weight: 1000 });

		await modalInteraction.editReply('Delete role...');
		let delete_role = await interaction.guild.roles.cache.find(role => role.name == `SOTA-${number}`);
		if (!delete_role) interaction.guild.roles.fetch().then(roles => delete_role = roles.cache.find(role => role.name == `SOTA-${number}`));
		await bucket.queue(async () => await delete_role?.delete(`Removing alliance server (${interaction.member.displayName} - ${interaction.member.id})`), { weight: 1000 });

		await modalInteraction.editReply('Rename other servers...');
		const rename_category = getCategories(interaction).first();

		const entry = await collection.findOne({ current_number: number }, { projection: { creation: 1, original_number: 1 } });
		const uptime = Math.floor((Date.now() - entry.creation.time) / 1000 / 60 / 60) + 'h ' + (Math.floor((Date.now() - entry.creation.time) / 1000 / 60) % 60 + 'm').padStart(3, '0');

		const { _id, ships } = await collection.findOne({ current_number: Number(number) }, { projection: { _id: 1, ships: 1 } });
		await collection.updateOne({ current_number: Number(number) },
			{
				$set: {
					current_number: null,
					shutdown: {
						time: new Date(),
						reason: interaction.options.getString('reason').toLowerCase(),
						officer: interaction.member.id,
						details: shutdownDetails,
					},
				},
			},
		);

		const shutdownEmbed = new EmbedBuilder()
			.setColor('e7c200')
			.setTitle(`Server ${number} - Shutdown`)
			.addFields({
				name: 'Reason',
				value: interaction.options.getString('reason'),
				inline: true,
			})
			.addFields({
				name: 'Ships',
				value: ships.length,
				inine: true,
			})
			.addFields({
				name: 'Uptime',
				value: uptime,
				inline: true,
			})
			.setTimestamp()
			.setFooter({ text: `ID: ${_id}`, iconURL: 'https://cdn.discordapp.com/avatars/842503111032832090/0b148002e73d45f2c66dfc7df1c228aa.png' });

		if (entry.original_number != number) shutdownEmbed.addFields({ name: 'Original Number', value: `${entry.original_number}`, inline: true });

		webhook.send({
			embeds: [shutdownEmbed],
		});

		if (rename_category?.server_number > number) {
			await collection.updateOne({ current_number: Number(rename_category.server_number) }, { $set: { current_number: Number(number) } });
			await rename_category.setName(`━━━[ SoT Alliance ${number} ]━━━`);
			await rename_category.children.cache.map(category => bucket.queue(async () => category.setName(category.name.replace(`${rename_category.server_number}`, number)), { weight: 1000 }));
			await bucket.queue(async () => await rename_category.setPosition(old_position), { weight: 1000 });
			await modalInteraction.editReply('Rename other role...');
			let rename_role = interaction.guild.roles.cache.find(role => role.name == `SOTA-${rename_category.server_number}`);

			if (!rename_role) {
				const roles = await interaction.guild.roles.fetch();
				rename_role = roles.cache.find(role => role.name == `SOTA-${rename_category.server_number}`);
			}

			if (!rename_role) {
				rename_role = await bucket.queue(async () => await interaction.guild.roles.create({
					name: `SOTA-${rename_category.server_number}`,
					reason: `Renaming alliance server (${interaction.member.displayName} - ${interaction.member.id})`,
					permissions: [],
				}));
			}
			if (rename_role) await bucket.queue(async () => await rename_role.setName(`SOTA-${number}`), { weight: 1000 });
			return modalInteraction.editReply(`Finished removing server! **\`[Server ${rename_category.server_number} is now Server ${number}]\`**`);
		}

		await modalInteraction.editReply('Finished removing server!');
	}).catch(() => new Error('time'));
}

function getCategories(interaction) {
	const categories = interaction.guild.channels.cache.filter(channel => channel.type === ChannelType.GuildCategory && channel.name.toLowerCase().includes('sot alliance '));
	categories.forEach(category => Object.assign(category, { server_number: category.name.match(/\d+/)[0] ?? null }));
	categories.sort((a, b) => b.server_number - a.server_number);

	return categories;
}

async function getServer(interaction, number) {
	return interaction.guild.channels.cache.find(channel => channel.name.toLowerCase() == (`━━━[ sot alliance ${number} ]━━━`));
}

async function getServerShipChannels(category) {
	return category.children.cache.filter(channel => channel.name.startsWith(`${category.server_number}-`) && !channel.name.toLowerCase().endsWith('situation room'));
}

async function getActiveShipChannels(category) {
	return await getServerShipChannels(category).then(ship_channels => ship_channels.filter(channel => channel.name.match(/-(\w{1,3})]/i)?.length > 1));
}

async function lockServer(interaction) {
	await interaction.reply('Find server...');
	const number = interaction.options.getNumber('number');
	const lock_category = await getServer(interaction, number);
	if (!lock_category) return interaction.editReply(`Server \`${number}\` does not exist!`);

	await interaction.editReply('Get channels...');
	const channels = await getServerShipChannels(lock_category);

	await interaction.editReply('Un-set channel limits...');
	await Promise.all(channels.map(channel => channel.setUserLimit(0, `Locking alliance server (${interaction.member.displayName} - ${interaction.member.id})`)));

	await interaction.editReply('Change permissions...');
	await Promise.all(channels.map(channel => channel.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: false, Connect: false }, { reason: `Locking alliance server (${interaction.member.displayName} - ${interaction.member.id})` })));

	await interaction.editReply(`Locked server \`${number}\``);
}

async function unlockServer(interaction) {
	await interaction.reply('Find server...');
	const number = interaction.options.getNumber('number');

	const unlock_category = await getServer(interaction, number);
	if (!unlock_category) return interaction.editReply(`Server \`${number}\` does not exist!`);

	await interaction.editReply('Get channels...');
	let channels = await getActiveShipChannels(unlock_category);

	if (channels.size == 0) {
		await interaction.guild.channels.fetch('', { force: true });
		channels = await getActiveShipChannels(unlock_category);
		if (channels.size == 0) return await interaction.editReply(`Server \`${number}\` does not have any active ships!`);
	}

	const ship_capacities = {
		'S': 2,
		'B': 3,
		'G': 4,
	};

	await interaction.editReply('Set channel limits...');
	await Promise.all(channels.map(channel => channel.setUserLimit(ship_capacities[channel.name.match(/-(\w{1,3})]/i)[1].replace('C', '')], `Unlocking alliance server (${interaction.member.displayName} - ${interaction.member.id})`)));

	await interaction.editReply('Change permissions...');
	await Promise.all(channels.map(channel => channel.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: true, Connect: true }, { reason: `Locking alliance server (${interaction.member.displayName} - ${interaction.member.id})` })));

	await interaction.editReply(`Unlocked server \`${number}\``);
}