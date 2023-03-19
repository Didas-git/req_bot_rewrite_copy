const { Events, ChannelType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Collection } = require('discord.js');
const redis = require('../modules/redis');

let listener_attached;
const localLogMessages = new Map();

const leaving_colours = {
	1: 'e7c200',
	2: 'e66700',
	3: 'e62600',
};

module.exports = {
	name: Events.MessageCreate,
	once: false,
	async execute(message, client) {
		const { channel, author: member } = message;
		const { config } = client;

		if (!listener_attached) {
			client.on('interactionCreate', handleInteraction);
			listener_attached = true;
		}

		if (member.bot) return;
		if (channel.type !== ChannelType.GuildText) return;
		if (!message.content.startsWith('?')) return;

		const splitMessage = message.content.split(' ');

		const [command, args] = [
			splitMessage.splice(0, 1)
				.map(arg => arg.slice(1).toLowerCase())[0],
			(splitMessage.length > 0) ? splitMessage : [],
		];

		switch (command) {

		case 'leaving':
			if (!channel.name.toLowerCase().endsWith('_leaving')) return;
			leavingRequest(args, member, channel, message, config, client);
			break;

		case 'msota':
			msota(args, channel, message);
			break;
		}
	},
};

async function msota(args, channel, message) {
	const { guild } = channel;
	let server = args && args[0];
	if (isNaN(server)) server = channel.name.match(/\d+/)[0] ?? null;
	const sota_role = guild.roles.cache.find(role => role.name == `SOTA-${server}`);
	if (!sota_role) return channel.send('Invalid server.').then(response => setTimeout(() => response.delete(), 5000));
	message.delete();
	await channel.send(`<@&${sota_role.id}>`).then(response => setTimeout(() => response.delete(), 1000));
}

async function dummyRequest(message, playerLeaving, leaving_channel, sot_leaving) {
	const prompt_embed = new EmbedBuilder()
		.setDescription(`**${playerLeaving} is leaving ${playerLeaving.voice.channel}**`)
		.setColor('e7c200');

	const officer_ack_button = new ActionRowBuilder()
		.addComponents(
			new ButtonBuilder()
				.setCustomId('leaving_clear')
				.setLabel('Clear')
				.setStyle(ButtonStyle.Secondary),
		);

	const prompt_message = await sot_leaving.send({ embeds: [prompt_embed], components: [officer_ack_button] });
	updatePromptColours(prompt_message, sot_leaving);
	return leaving_channel.send('Dummy leaving request created.').then(response => setTimeout(() => response.delete(), 5000)).then(() => message.delete());
}

async function leavingRequest(args, requester, leaving_channel, message, config) {
	const { guild } = leaving_channel;
	const officer_role = guild.roles.cache.find(role => role.name == config.Mentions.roles.officer);
	const ping_role = guild.roles.cache.find(role => role.name == config.STAFF_PING_ROLE);
	const help_desk = guild.channels.cache.find(channel => channel.name.endsWith(config.Mentions.channels.help_desk));
	const sot_leaving = guild.channels.cache.find(channel => channel.name == config.Mentions.channels.sot_leaving);

	let playerLeaving = await guild.members.fetch(requester).catch(() => null);
	const otherPlayer = await (args.length && args[0].match(/\d+/) && guild.members.fetch(args[0].match(/\d+/)[0]).catch(() => null));
	if (otherPlayer) playerLeaving = otherPlayer;

	const self_request = playerLeaving.id == requester.id || !playerLeaving;

	const is_on_duty = playerLeaving.roles.cache.has(ping_role.id);
	const is_on_ship = playerLeaving.voice && playerLeaving.voice.channel && playerLeaving.voice.channel.name.match(/-(\w{1,3})]/i)?.length > 1;
	if (!is_on_ship) return leaving_channel.send(`${requester}\n${(self_request) ? 'You are' : 'That player is'} not on a ship.${(is_on_duty ? '\n*Don\'t forget to rename the channel!*' : '')}`).then(response => setTimeout(() => response.delete(), 5000)).then(() => message.delete());

	if (is_on_duty) return dummyRequest(message, playerLeaving, leaving_channel, sot_leaving);

	const already_leaving = await redis.exists(`leaving_req:${playerLeaving.id}`).catch(e => console.error(e));
	if (already_leaving) return leaving_channel.send(`${requester}\n${(self_request) ? 'You' : 'That player'} already has an active leaving request.`).then(response => setTimeout(() => response.delete(), 5000)).then(() => message.delete());

	const sot_logs = guild.channels.cache.find(channel => channel.name == config.Mentions.channels.sot_logs);
	const expiry = Math.floor(Date.now() / 1000) + (60 * 30);

	const user_embed = new EmbedBuilder()
		.setDescription(`**Leaving Request Received**\n\n${playerLeaving}, we have received your request to leave.\nPlease be patient while a ${officer_role} handles your request.\n\nVisit the ${help_desk} to request cancellation.\n\nExpires: <t:${expiry}:R>`)
		.setColor('e7c200');

	if (!self_request) user_embed.addFields({ name: 'Requested By', value: requester.toString() });

	const prompt_embed = new EmbedBuilder()
		.setDescription(`**${playerLeaving} is leaving ${playerLeaving.voice.channel}**`)
		.setColor('e7c200');

	const log_embed = new EmbedBuilder()
		.setTitle(`${playerLeaving.user.tag} is leaving ${playerLeaving.voice.channel}`)
		.addFields(
			[
				{ name: 'Original Ship Name', value: playerLeaving.voice.channel.name, inline: true },
				{ name: 'Requester', value: requester.toString(), inline: true },
				{ name: 'Expires', value: `<t:${expiry}:f>`, inline: true },
			],
		)
		.setTimestamp()
		.setFooter({ text: 'Pending Approval' })
		.setColor('e7c200');

	const officer_prompt_buttons = new ActionRowBuilder()
		.addComponents(
			new ButtonBuilder()
				.setCustomId('leaving_approve')
				.setLabel('Approve')
				.setStyle(ButtonStyle.Success),

			new ButtonBuilder()
				.setCustomId('leaving_cancel')
				.setLabel('Cancel')
				.setStyle(ButtonStyle.Danger),
		);

	const officer_prompt = await sot_leaving.send({ embeds: [prompt_embed], components: [officer_prompt_buttons] });
	const logs_message = await sot_logs.send({ embeds: [log_embed] });
	const user_message = await leaving_channel.send({ embeds: [user_embed] });

	sot_leaving.send(`${ping_role}`).then(ping => ping.delete());

	guild.client.timeouts.set(playerLeaving.id, [
		setTimeout(() => {
			expireRequest(playerLeaving.id, officer_prompt.id, sot_logs, sot_leaving, leaving_channel.id, user_message.id, playerLeaving.voice.channel);
		}, 1000),
	]);

	const redis_hash = {
		created: new Date().toISOString(),
		requester: requester.id,
		request_channel: leaving_channel.id,
		message: user_message.id,
		prompt_message: officer_prompt.id,
		logs_message: logs_message.id,
		ship_channel: playerLeaving.voice.channel.id,
	};

	console.log(`[${officer_prompt.id}] ${playerLeaving.user.tag} is leaving - requested by ${requester.tag}`);
	localLogMessages.set(officer_prompt.id, logs_message.id);

	await redis.hSet(`leaving_req:${playerLeaving.id}`, redis_hash);

	await message.delete().catch(() => null);

	redis.expire(`leaving_req:${playerLeaving.id}`, 60 * 30);
	redis.set(`warn_window:${playerLeaving.id}`, `${Date.now() + (1000 * 60 * 10)}`, { EX: 60 * 10 });

	updatePromptColours(officer_prompt, sot_leaving);
}

async function updatePromptColours(prompt_message, sot_leaving, client, options) {
	const bucket = client.bucket;

	const all_prompt_messages = await sot_leaving.messages.fetch().catch(e => console.error(e));
	let filtered_prompt_messages = all_prompt_messages.filter(message => message.id != all_prompt_messages.last().id && message.embeds.length);
	if (options?.exclude) filtered_prompt_messages = filtered_prompt_messages.filter(message => message.id != options.exclude.id);

	const ship_mention = prompt_message.embeds[0].data.description.match(/<#\d{16,}>/g)[0];
	const ship_prompt_messages = filtered_prompt_messages.filter(message => message.embeds[0].data.description.includes(ship_mention));
	if (ship_prompt_messages.size == 1 && !options) return;

	const colour = leaving_colours[(ship_prompt_messages.size > 3) ? 3 : ship_prompt_messages.size];
	await Promise.all(ship_prompt_messages.map((message, index) => {
		const embed = message.embeds[0];

		embed.data.color = parseInt(colour, 16);
		return bucket.queue(async () => message.edit({ embeds: [embed] }).catch(() => null), { weight: 100 + index });
	}));
}

async function handleInteraction(interaction) {
	if (!interaction.isButton()) return;

	const sot_logs = interaction.guild.channels.cache.find(channel => channel.name == interaction.client.config.Mentions.channels.sot_logs);
	const help_desk = interaction.guild.channels.cache.find(channel => channel.name.endsWith(interaction.client.config.Mentions.channels.help_desk));
	const sot_leaving = interaction.guild.channels.cache.find(channel => channel.name == interaction.client.config.Mentions.channels.sot_leaving);

	await updatePromptColours(interaction.message, sot_leaving, interaction.client, { exclude: interaction.message });

	if (interaction.customId == 'leaving_approve') await handleRequest(true, interaction, sot_logs, sot_leaving);
	if (interaction.customId == 'leaving_cancel') await handleRequest(false, interaction, sot_logs, help_desk, sot_leaving);
	if (interaction.customId == 'leaving_clear') await clearRequest(interaction, sot_logs);
}

async function clearRequest(interaction, sot_logs) {
	interaction.message.delete().catch(() => null);

	const log_message_id = localLogMessages.get(interaction.message.id);
	const log_message = await sot_logs.messages.fetch(log_message_id).catch(() => null);

	if (log_message) {
		const log_embed = 'embeds' in log_message && log_message.embeds.length && log_message.embeds[0];

		if (!log_embed) return;

		log_embed.data.footer.text = `Cleared by ${interaction.user.tag}`;
		log_embed.data.timestamp = new Date().toISOString();
		log_message.edit({ embeds: [log_embed] });
	}

	localLogMessages.delete(interaction.message.id);
	console.log(`[${interaction.message.id}] Request cleared by ${interaction.user.tag}`);
}

async function expireRequest(member_id, prompt_id, sot_logs, sot_leaving, leaving_channel_id, user_message_id) {
	let prompt_message;
	try {
		prompt_message = await sot_leaving.messages.fetch(prompt_id).catch(() => null);
	}
	catch (e) {
		return;
	}

	if (!prompt_message) {
		await sot_leaving.messages.fetch('', { force: true }).catch(() => null);

		prompt_message = await sot_leaving.messages.fetch(prompt_id).catch(() => null);
		if (!prompt_message) return;
	}

	let leaving_channel = await sot_leaving.guild.channels.fetch(leaving_channel_id).catch(() => null);
	if (!leaving_channel) {
		await sot_leaving.messages.fetch('', { force: true }).catch(() => null);

		leaving_channel = await sot_leaving.guild.channels.fetch(leaving_channel_id).catch(() => null);
		if (!leaving_channel) return;
	}

	let user_message = await leaving_channel.messages.fetch(user_message_id).catch(() => null);
	if (!user_message) {
		await leaving_channel.messages.fetch('', { force: true }).catch(() => null);

		user_message = await leaving_channel.messages.fetch(user_message_id).catch(() => null);
		if (!user_message) return;
	}

	const user_embed = 'embeds' in user_message && user_message.embeds.length && user_message.embeds[0];

	if (!user_embed) return;

	user_embed.data.description = user_embed.data.description.replace(/Expires: <t:\d+:R>/i, '');
	user_embed.data.description = user_embed.data.description.replace('Leaving Request Received', 'Leaving Request Expired');
	Object.assign(user_embed.data, { footer: { text: 'Expired' }, timestamp: new Date().toISOString() });
	user_message.edit({ embeds: [user_embed] });

	const expired_embed = new EmbedBuilder()
		.setTitle('Leaving Request Expired')
		.setDescription(`<@${member_id}>, your leaving request has expired.\nPlease submit another unless you intend to continue playing.`)
		.setColor('e62600');

	user_message.reply({ embeds: [expired_embed] });
	leaving_channel.send(`<@${member_id}>`).then(ping => ping.delete());

	const log_message_id = localLogMessages.get(prompt_id);
	if (!log_message_id) return;
	updatePromptColours(prompt_message, sot_leaving);
	prompt_message.delete().catch(() => null);

	let log_message = await sot_logs.messages.fetch(log_message_id).catch(() => null);
	if (!log_message) {
		await sot_logs.messages.fetch('', { force: true }).catch(() => null);

		log_message = await sot_logs.messages.fetch(log_message_id).catch(() => null);
		if (!log_message) return;
	}

	const log_embed = log_message.embeds.length && log_message.embeds[0];
	if (!log_embed) return;

	log_embed.data.footer.text = 'Expired';
	log_embed.data.timestamp = new Date().toISOString();
	log_message.edit({ embeds: [log_embed] });

	sot_leaving.guild.members.fetch(member_id)
		.then(member => console.log(`[${prompt_id}] Request expired for ${member.user.tag}`));
}

async function handleRequest(approved, interaction, sot_logs, help_desk) {
	interaction.message.delete().catch(() => null);
	interaction.client.timeouts.get(interaction.user.id)?.forEach(timeout => clearTimeout(timeout));

	await editLogMessage(interaction.message.id, (approved) ? `Approved by ${interaction.user.tag}` : `Cancelled by ${interaction.user.tag}`, sot_logs);
	await notifyUser(interaction, approved, (approved) ? `your leaving request has been approved by ${interaction.member}\nPlease ensure you invite your replacement before heading out.` : `your leaving request was cancelled by ${interaction.member}\nIf you believe this was in error, please visit the ${help_desk}`);

	const request = await getLeavingEntryByMessageID(interaction.message.id);
	if (!request || !('requester' in request)) return;
	redis.del(`leaving_req:${request.requester}`);
	redis.del(`warn_window:${request.requester}`);

	if (approved) {
		redis.hSet(`approval:${request.requester}`, {
			approved_by: interaction.user.id,
			approved_at: new Date().toISOString(),
		});

		redis.expire(`approval:${request.requester}`, 60 * 30);
	}

	localLogMessages.delete(interaction.message.id);
	console.log(`[${interaction.message.id}] Request ${(approved) ? 'approved' : 'cancelled'} by ${interaction.user.tag}`);
}

async function editLogMessage(messageId, message, log_channel) {
	const request = await getLeavingEntryByMessageID(messageId);
	if (!request) return;

	const log_message = await log_channel.messages.fetch(request.logs_message).catch(() => null);
	const log_embed = log_message.embeds[0];

	log_embed.data.footer.text = message;
	log_embed.data.timestamp = new Date().toISOString();
	log_message.edit({ embeds: [log_embed] });
}

async function getAllLeavingRequests() {
	const keys = await redis.keys('leaving_req:*');
	const values = new Collection();
	await Promise.all(
		keys.map(key => new Promise((resolve) => {
			redis.hGetAll(key).then(value => {
				values.set(key, {
					...value,
					user: key.split(':')[1],
				});
				resolve();
			});
		})),
	);

	return values;
}

async function getLeavingEntryByMessageID(messageID) {
	const leaving_requests = await getAllLeavingRequests();
	return leaving_requests.find(request => request.prompt_message == messageID);
}

async function notifyUser(interaction, approved, messageContent) {
	const request = await getLeavingEntryByMessageID(interaction.message.id);
	if (!request) return;

	const request_channel = await interaction.guild.channels.fetch(request.request_channel).catch(() => null);
	const user_message = await request_channel.messages.fetch(request.message).catch(() => null);
	const member = await interaction.guild.members.fetch(request.user).catch(() => null);

	const approval_embed = new EmbedBuilder()
		.setTitle('Leaving Request Approved')
		.setDescription(`${member}, ${messageContent}`)
		.setColor('00e631');

	const cancel_embed = new EmbedBuilder()
		.setTitle('Leaving Request Cancelled')
		.setDescription(`${member}, ${messageContent}`)
		.setColor('e62600');

	user_message.reply({ embeds: [(approved) ? approval_embed : cancel_embed] });
	request_channel.send(`${member}`).then(ping => ping.delete());
}