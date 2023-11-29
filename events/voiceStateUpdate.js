const { Events, ChannelType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const redis = require('../modules/redis.js');

const accessTimers = new Map();
const users_visited_help_desk = new Map();

module.exports = {
	name: Events.VoiceStateUpdate,
	once: false,
	async execute(oldState, newState, client) {
		if (oldState.channelId == newState.channelId) return;

		const categories = getCategories(newState.guild);
		const channel_ids = await Promise.all(categories.map(category => getServerShipChannels(category).then(server => server.map(channel => channel.id)))).then(ids => ids.flat());
		const help_desk = oldState.guild.channels.cache.find(channel => channel.name.endsWith(client.config.Mentions.channels.help_desk));
		const waiting_room = oldState.guild.channels.cache.find(channel => channel.name.endsWith(client.config.Mentions.channels.waiting_room));
		const supporter_room = oldState.guild.channels.cache.find(channel => channel.name.endsWith(client.config.Mentions.channels.supporter_room));
		const is_on_duty = oldState.member?.roles.cache.find(role => role.name == client.config.STAFF_PING_ROLE) ?? false;

		let relates_to_a_ship = [oldState?.channelId ?? false, newState?.channelId ?? false].some(ship_channel_id => channel_ids.includes(ship_channel_id));
		const [joined_help_desk, left_help_desk] = [newState.channelId == help_desk.id, oldState.channelId == help_desk.id];
		const joined_queue = newState.channelId == waiting_room.id || newState.channelId == supporter_room.id;
		const locked = await redis.get('state:alliance_locked').then(returnedState => Number(returnedState)) ?? true;

		if(joined_queue && !locked) {
			const unlocked_embed = new EmbedBuilder()
				.setDescription(`**Alliance Servers Unlocked**\n\nWe're sending you this message to inform you that the __servers are currently unlocked__.\n\nThis means you can join a ship withot an officer present.\nPlease try your best to follow the order of the queue, and when you wish to leave, inform the queue that your spot has become available.\n\nPlease beware that leaving requests are not required, you may leave at many time, and that you should follow all rules of our community.\n\nIf you require any help, please send a direct message to <@1006589854802514050>.`)
				.setColor('e66700');
			
			return newState.member.send({ embeds: [unlocked_embed] }).catch(() => null);
		}

		const joined_a_ship = channel_ids.includes(newState?.channelId);

		if (left_help_desk && !joined_a_ship && users_visited_help_desk.has(oldState.id)) {
			relates_to_a_ship = true;
			oldState = users_visited_help_desk.get(oldState.id);
			users_visited_help_desk.delete(oldState.id);
		}

		const left_a_ship = channel_ids.includes(oldState?.channelId);

		if (joined_help_desk && !is_on_duty) helpDeskNotification(newState, client, oldState, (left_a_ship && joined_help_desk && !is_on_duty));

		if (!left_a_ship && joined_help_desk && !is_on_duty) console.log(`${oldState.member.user.tag} joined the help desk`);
		if (left_help_desk && !is_on_duty) console.log(`${oldState.member.user.tag} left the help desk`);
		if (!relates_to_a_ship) return;


		if (left_a_ship && joined_help_desk) {
			if (!is_on_duty) console.log(`${oldState.member.user.tag} joined the help desk from their alliance`);
			return users_visited_help_desk.set(oldState.id, oldState);
		}

		if (left_help_desk && joined_a_ship && users_visited_help_desk.has(newState.member.id)) return users_visited_help_desk.delete(newState.member.id);

		if (is_on_duty) return;
		client.bucket.queue(async () => {
			if (left_a_ship) checkLeavingRequest(oldState, client);
			if (joined_a_ship && !left_a_ship) joinedShip(newState);
			if (!joined_a_ship && left_a_ship) await leftShip(oldState, { RECONNECT_MS: client.config.Settings.RECONNECT_MS });
			if (joined_a_ship && left_a_ship) await movedShip(oldState, newState);
		}, { id: newState.member.id });
	},
};


async function helpDeskNotification(state, client, oldState, isMoved = false) {
	const sot_logs = state.guild.channels.cache.find(channel => channel.name == client.config.Mentions.channels.sot_logs);
	const help_desk = state.guild.channels.cache.find(channel => channel.name.endsWith(client.config.Mentions.channels.help_desk));
	const officers = help_desk.members.filter(member => member.roles.cache.find(role => role.name == client.config.STAFF_PING_ROLE));
	const upper_staff = client.config.MANAGER_ROLE_NAMES.some(role_name => help_desk.members.filter(member => member.id != state.member.id).filter(member => member.roles.cache.find(role => role.name == role_name)).size);
	const ping_role = state.guild.roles.cache.find(role => role.name == client.config.STAFF_PING_ROLE);

	if (isMoved) {
		const movedEmbed = new EmbedBuilder()
			.setDescription(`**${state.member} moved from ${oldState.channel} to the help desk.**`)
			.setColor('e66700');

		await sot_logs.send({ embeds: [movedEmbed] });
		return sot_logs.send(`${ping_role}`).then(ping => ping.delete());
	}

	if (officers.size || upper_staff) return;

	const helpDeskEmbed = new EmbedBuilder()
		.setDescription(`**${state.member} joined the help desk without a staff member present.**`)
		.setColor('e62600');

	const april_fools = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', month: 'numeric' }) == '4' && new Date().toLocaleString('en-US', { timeZone: 'America/New_York', day: 'numeric' }) == '1';
	const christmas = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', month: 'numeric' }) == '12' && new Date().toLocaleString('en-US', { timeZone: 'America/New_York', day: 'numeric' }) == '25';
	const new_years_day = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', month: 'numeric' }) == '1' && new Date().toLocaleString('en-US', { timeZone: 'America/New_York', day: 'numeric' }) == '1';

	const locked = await redis.get('state:alliance_locked').then(returnedState => Number(returnedState)) ?? true;
	if (locked && !april_fools && !christmas && !new_years_day) {
		state.member.send('An officer knows you are waiting, and will be with you shortly, we appreciate your patience.').catch(() => null);
	}

	else {
		if (april_fools) {
			state.member.send(`Dear ${state.member.nickname ?? state.member.user.username},
	
	We regret to inform you that the officer you are waiting for has been abducted by aliens. Yes, you read that right. Aliens. Apparently, they were in dire need of a committee chair for their intergalactic council and thought that our officer would be the perfect fit.
			
	But don't worry, we have already sent a team of highly skilled negotiators to negotiate the officer's release. We are confident that they will be able to strike a deal with the aliens and bring the officer back to us safe and sound.
			
	In the meantime, we suggest that you grab a cup of coffee, kick back, and relax. After all, there's not much you can do when the officer has been abducted by aliens, right?
			
	We apologize for any inconvenience this may have caused and hope that you have a happy April Fools' Day!
			
	Sincerely,
	The Committee`).catch(() => null);
		}

		if (christmas) {
			state.member.send(`Dear ${state.member.nickname ?? state.member.user.username},
	
	We're reaching out with an unexpected twist to your holiday anticipation. Brace yourself for a tale that's not quite like any Christmas story you've heard before.
	
	Our esteemed officer is on a special assignment that's straight out of a holiday blockbuster. It turns out, they've been chosen as the official cookie taster for an elite group of interdimensional gingerbread bakers. Yes, you read that right – gingerbread from other realms!
	
	The enchanted bakers apparently recognized our officer's impeccable taste buds and couldn't resist inviting them to join in the festive culinary exchange. Fear not, though, as we've dispatched a team of seasoned flavor negotiators to ensure the safe return of our officer once the tasting extravaganza concludes.
	
	In the meantime, we suggest you whip up your favorite holiday treats, share the joy with loved ones, and perhaps experiment with some out-of-this-world cookie recipes. After all, 'tis the season for unexpected sweetness!
	
	We sincerely apologize for any delightful disruption this news may cause and wish you a joyous and uniquely flavorful holiday season.
	
	Warmly,
	The Holiday Treat Committee`).catch(() => null);
		}

		if (new_years_day) {
			state.member.send(`Dear ${state.member.nickname ?? state.member.user.username},
	
	Hold onto your hats, for we bring you news that will add a cosmic sparkle to your New Year's anticipation. Our awaited officer has taken on a role that transcends the ordinary celebrations – they've been chosen as the intergalactic dance instructor for the annual Cosmic Ball that unfolds as the clock strikes midnight across the universe.
	
	Picture this: our officer guiding extraterrestrial beings and celestial entities in a dance that harmonizes the cosmic energies for a synchronized start to the New Year. It seems their dance moves are not only a hit on Earth but have garnered attention across the cosmos.
	
	Worry not, as we've dispatched a team of rhythm negotiators to work with the Cosmic DJ and ensure our officer returns just in time for the traditional New Year's toast. In the meantime, we encourage you to put on your dancing shoes, revel in the music of the cosmos, and welcome the New Year with a celestial twirl of your own.
	
	We apologize for the unexpected dance floor twist and wish you a New Year filled with unique rhythms, celestial joys, and extraordinary moments.
	
	Dancing through dimensions,
	The Cosmic Celebration Committee`).catch(() => null);
		}
	}

	if (!locked) return state.member.send('The servers are currently unlocked, meaning there is no officer available, if you need help please send a direct message to <@1006589854802514050>').catch(() => null);

	sot_logs.send({ embeds: [helpDeskEmbed] });
	sot_logs.send(`${ping_role}`).then(ping => ping.delete());
}

function getCategories(guild) {
	const categories = guild.channels.cache.filter(channel => channel.type === ChannelType.GuildCategory && channel.name.toLowerCase().includes('sot alliance '));
	categories.forEach(category => Object.assign(category, { server_number: category.name.match(/\d+/)[0] ?? null }));
	categories.sort((a, b) => b.server_number - a.server_number);

	return categories;
}

async function getServerShipChannels(category) {
	return category.children.cache.filter(channel => channel.name.startsWith(`${category.server_number}-`) && !channel.name.toLowerCase().endsWith('situation room'));
}

function joinedShip(state) {
	const server_number = state.channel.name.match(/\d+/)[0];
	const sota_role = state.guild.roles.cache.find(role => role.name == `SOTA-${server_number}`);

	state.member.roles.add(sota_role, 'Joined a ship');
	state.channel.permissionOverwrites.create(state.member, { ViewChannel: true, Connect: true }, 'Joined a ship');
	clearTimeout(accessTimers.get(`${state.channelId}:${state.member.id}`));
	accessTimers.delete(`${state.channelId}:${state.member.id}`);
}

async function leftShip(state, options) {
	const channel = state.channel && state.channel.id && await state.guild.channels.fetch(state.channel.id).catch(() => null);
	if (!channel) return;

	const server_number = channel.name.match(/\d+/)[0];
	const sota_role = state.guild.roles.cache.find(role => role.name == `SOTA-${server_number}`);

	if (!options || !('skipRemoveSotaRole' in options)) state.member.roles.remove(sota_role, 'Left a ship');
	if (!options || !('RECONNECT_MS' in options)) return state.channel.permissionOverwrites.delete(state.member, 'Left a ship');

	removeChannelPermission(state.client, state.member.id, channel.id, options, state);
}

function removeChannelPermission(client, member_id, channel_id, options, state) {
	accessTimers.set(`${channel_id}:${member_id}`, setTimeout(async () => {
		let channel = await client.channels.fetch(channel_id).catch(async () => {
			await client.channels.fetch().catch(() => null);
			return await client.channels.fetch(channel_id).catch(() => null);
		});

		if (!channel || channel instanceof Error) channel = state.channel && state.channel;
		if (!channel) return;
		channel.permissionOverwrites.delete(member_id, 'Left a ship');
	}, options.RECONNECT_MS));
}

async function movedShip(oldState, newState) {
	const [old_server_number, new_server_number] = [oldState, newState].map(state => state.channel.name.match(/\d+/)[0]);

	joinedShip(newState);
	if (old_server_number == new_server_number) return leftShip(oldState, { skipRemoveSotaRole: true });
	await leftShip(oldState);
}

async function checkLeavingRequest(voiceState, client) {
	const { member } = voiceState;

	const sot_logs = voiceState.guild.channels.cache.find(channel => channel.name == client.config.Mentions.channels.sot_logs);
	const sot_leaving = voiceState.guild.channels.cache.find(channel => channel.name == client.config.Mentions.channels.sot_leaving);

	const approval = await redis.exists(`approval:${member.id}`);
	const warn_window = await redis.exists(`warn_window:${member.id}`);
	const leaving_req = await redis.exists(`leaving_req:${member.id}`);

	const prompt_message_id = await redis.hGet(`leaving_req:${member.id}`, 'prompt_message');
	const prompt_message = prompt_message_id && await sot_leaving.messages.fetch(prompt_message_id).catch(() => null);

	const officer_ack_button = new ActionRowBuilder()
		.addComponents(
			new ButtonBuilder()
				.setCustomId('leaving_clear')
				.setLabel('Clear')
				.setStyle(ButtonStyle.Secondary),
		);

	if (prompt_message) prompt_message.edit({ components: [officer_ack_button] });

	client.timeouts.get(member.id)?.forEach(timeout => clearTimeout(timeout));
	if (approval) return approved_to_leave(voiceState, sot_logs);
	if (!leaving_req) return no_leaving_request(voiceState, sot_logs);
	if (warn_window) return left_to_soon(voiceState, sot_logs);
	return left_without_approval(voiceState, sot_logs);
}

async function no_leaving_request(voiceState, sot_logs) {
	const { member, channel } = voiceState;
	if (!channel) return;

	const log_embed = new EmbedBuilder()
		.setDescription(`**${member} left ${voiceState.channel} without permission.**`)
		.setFooter({ text: 'Their notice may have expired, or they left a significant time after approval.' })
		.setColor('e62600');

	sot_logs.send({ embeds: [log_embed] });
	ping_officer(sot_logs);
	console.log(`${member.user.tag} left ${voiceState.channel.name} without permission.`);
}

async function approved_to_leave(voiceState, sot_logs) {
	const { member, guild } = voiceState;
	const { approved_by: approved_by_id, approved_at: approved_at_iso } = await redis.hGetAll(`approval:${member.id}`);
	const [approved_by, approved_at] = [guild.members.fetch(approved_by_id).catch(() => null), new Date(approved_at_iso)];

	const log_embed = new EmbedBuilder()
		.setDescription(`**${member} left ${voiceState.channel}**\nApproved by ${await approved_by} at <t:${Math.floor(approved_at / 1000)}:f>`)
		.setColor('00e631');

	sot_logs.send({ embeds: [log_embed] });

	redis.del(`approval:${member.id}`);
	console.log(`${member.user.tag} left ${voiceState.channel.name} after approval.`);
}

async function left_to_soon(voiceState, sot_logs) {
	const { member } = voiceState;
	const created_iso = await redis.hGet(`leaving_req:${member.id}`, 'created');

	const seconds_since_request = Math.floor((new Date().getTime() - new Date(created_iso).getTime()) / 1000);

	const ss = seconds_since_request % 60;
	const mm = Math.floor(seconds_since_request / 60) % 60;

	const log_embed = new EmbedBuilder()
		.setDescription(`**${member} left ${voiceState.channel} after ${mm.toString().padStart(2, '0')}m ${ss.toString().padStart(2, '0')}s**`)
		.setFooter({ text: 'The user left the ship too soon, they should stay for 10 mins unless approved.' })
		.setColor('e66700');

	sot_logs.send({ embeds: [log_embed] });
	ping_officer(sot_logs);

	redis.del(`warn_window:${member.id}`);
	redis.del(`leaving_req:${member.id}`);
	console.log(`${member.user.tag} left ${voiceState.channel.name} after ${mm}m ${ss}s.`);
}

async function left_without_approval(voiceState, sot_logs) {
	const { member } = voiceState;
	const { created: created_iso } = await redis.hGetAll(`leaving_req:${member.id}`);

	const seconds_since_request = Math.floor((new Date().getTime() - new Date(created_iso).getTime()) / 1000);

	const ss = seconds_since_request % 60;
	const mm = Math.floor(seconds_since_request / 60) % 60;

	const log_embed = new EmbedBuilder()
		.setDescription(`**${member} left ${voiceState.channel} ${mm}m ${ss}s after requesting.**`)
		.setFooter({ text: 'The user stayed the full notice period before leaving.' })
		.setColor('00e631');

	sot_logs.send({ embeds: [log_embed] });

	redis.del(`warn_window:${member.id}`);
	redis.del(`leaving_req:${member.id}`);
	console.log(`${member.user.tag} left ${voiceState.channel.name} ${mm}m ${ss}s after requesting.`);
}

async function ping_officer(channel) {
	const ping_role = channel.guild.roles.cache.find(role => role.name == channel.client.config.STAFF_PING_ROLE);
	channel.send(`${ping_role}`).then(ping => ping.delete());
}