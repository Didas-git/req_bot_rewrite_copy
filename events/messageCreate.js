const { Events, ChannelType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Collection } = require('discord.js');
const redis = require('../modules/redis');

let listener_attached;
const localLogMessages = new Map();

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
		if (!channel.name.toLowerCase().endsWith('_leaving')) return;
		if (!message.content.startsWith('?')) return;

		const splitMessage = message.content.split(' ');

		const [command, args] = [
			splitMessage.splice(0, 1)
				.map(arg => arg.slice(1).toLowerCase())[0],
			(splitMessage.length > 0) ? splitMessage : [],
		];

		switch (command) {

		case 'leaving':
			leavingRequest(args, member, channel, message, config, client);
			break;
		}
	},
};

async function leavingRequest(args, requester, leaving_channel, message, config) {
	const { guild } = leaving_channel;
	const officer_role = guild.roles.cache.find(role => role.name == config.Mentions.roles.officer);
	const ping_role = guild.roles.cache.find(role => role.name == config.STAFF_PING_ROLE);
	const help_desk = guild.channels.cache.find(channel => channel.name.endsWith(config.Mentions.channels.help_desk));

	let playerLeaving = await guild.members.fetch(requester);
	const otherPlayer = args.length && args[0].match(/\d+/) && await guild.members.fetch(args[0].match(/\d+/));
	if (otherPlayer) playerLeaving = otherPlayer;

	const self_request = playerLeaving.id == requester.id || !playerLeaving;

	const is_on_ship = playerLeaving.voice && playerLeaving.voice.channel.name.match(/-(\w{1,3})]/i)?.length > 1;
	if (!is_on_ship) return leaving_channel.send(`${requester}\n${(self_request) ? 'You are' : 'That player is'} not on a ship.`).then(response => setTimeout(() => response.delete(), 5000)).then(() => message.delete());

	const already_leaving = await redis.exists(`leaving_req:${playerLeaving.id}`).catch(e => console.error(e));
	if (already_leaving) return leaving_channel.send(`${requester}\n${(self_request) ? 'You' : 'That player'} already has an active leaving request.`).then(response => setTimeout(() => response.delete(), 5000)).then(() => message.delete());

	const sot_logs = guild.channels.cache.find(channel => channel.name == config.Mentions.channels.sot_logs);
	const sot_leaving = guild.channels.cache.find(channel => channel.name == config.Mentions.channels.sot_leaving);
	const expiry = Math.floor(Date.now() / 1000) + (60 * 30);

	const user_embed = new EmbedBuilder()
		.setDescription(`**Leaving Request Received**\n\n${playerLeaving}, we have received your request to leave.\nPlease be patient while a ${officer_role} handles your request.\n\nVisit the ${help_desk} to request cancellation.\n\nExpires: <t:${expiry}:R>`)
		.setColor('e7c200');

	if (!self_request) user_embed.addFields({ name: 'Requested By', value: requester.toString() });

	const prompt_embed = new EmbedBuilder()
		.setDescription(`**${playerLeaving} is leaving ${playerLeaving.voice.channel}**`)
		.setColor('e7c200');

	const log_embed = new EmbedBuilder()
		.setTitle(`${playerLeaving.displayName}#${playerLeaving.user.discriminator} is leaving ${playerLeaving.voice.channel}`)
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
			expireRequest(officer_prompt.id, sot_logs, sot_leaving);
		}, 1000 * 60 * 30),
	]);

	const redis_hash = {
		created: new Date().toISOString(),
		requester: requester.id,
		request_channel: leaving_channel.id,
		message: user_message.id,
		prompt_message: officer_prompt.id,
		logs_message: logs_message.id,
	};

	console.log(`[${officer_prompt.id}] ${playerLeaving} is leaving - requested by ${requester}`);
	localLogMessages.set(officer_prompt.id, logs_message.id);

	await redis.hSet(`leaving_req:${playerLeaving.id}`, redis_hash);

	message.delete().catch(e => e);

	redis.expire(`leaving_req:${playerLeaving.id}`, 60 * 30);
	redis.set(`warn_window:${playerLeaving.id}`, `${Date.now() + (1000 * 60 * 10)}`, { EX: 60 * 10 });
}

async function handleInteraction(interaction) {
	if (!interaction.isButton()) return;

	const sot_logs = interaction.guild.channels.cache.find(channel => channel.name == interaction.client.config.Mentions.channels.sot_logs);
	const help_desk = interaction.guild.channels.cache.find(channel => channel.name.endsWith(interaction.client.config.Mentions.channels.help_desk));

	if (interaction.customId == 'leaving_approve') handleRequest(true, interaction, sot_logs);
	if (interaction.customId == 'leaving_cancel') handleRequest(false, interaction, sot_logs, help_desk);
	if (interaction.customId == 'leaving_clear') clearRequest(interaction, sot_logs);
}

async function clearRequest(interaction, sot_logs) {
	interaction.message.delete().catch(e => e);

	const log_message_id = localLogMessages.get(interaction.message.id);
	const log_message = await sot_logs.messages.fetch(log_message_id);

	if (log_message) {
		const log_embed = log_message.embeds[0];

		log_embed.data.footer.text = `Cleared by ${interaction.user.tag}`;
		log_embed.data.timestamp = new Date().toISOString();
		log_message.edit({ embeds: [log_embed] });
	}

	localLogMessages.delete(interaction.message.id);
	console.log(`[${interaction.message.id}] Request cleared by ${interaction.user.tag}`);
}

async function expireRequest(prompt_id, sot_logs, sot_leaving) {
	const prompt_message = await sot_leaving.messages.fetch(prompt_id);
	if (!prompt_message) return;

	const log_message_id = localLogMessages.get(prompt_id);
	prompt_message.delete().catch(e => e);

	const log_message = await sot_logs.messages.fetch(log_message_id);
	if (!log_message) return;

	const log_embed = log_message.embeds[0];

	log_embed.data.footer.text = 'Expired';
	log_embed.data.timestamp = new Date().toISOString();
	log_message.edit({ embeds: [log_embed] });
}

async function handleRequest(approved, interaction, sot_logs, help_desk) {
	interaction.message.delete().catch(e => e);
	interaction.client.timeouts.get(interaction.user.id)?.forEach(timeout => clearTimeout(timeout));

	await editLogMessage(interaction.message.id, (approved) ? `Approved by ${interaction.user.tag}` : `Cancelled by ${interaction.user.tag}`, sot_logs);
	await notifyUser(interaction, approved, (approved) ? `your leaving request has been approved by ${interaction.member}\nPlease ensure you invite your replacement before heading out.` : `your leaving request was cancelled by ${interaction.member}\nIf you believe this was in error, please visit the ${help_desk}`);

	const request = await getLeavingEntryByMessageID(interaction.message.id);
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

	const log_message = await log_channel.messages.fetch(request.logs_message);
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
	const request_channel = await interaction.guild.channels.fetch(request.request_channel);
	const user_message = await request_channel.messages.fetch(request.message);
	const member = await interaction.guild.members.fetch(request.user);

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