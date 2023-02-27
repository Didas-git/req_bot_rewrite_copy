const { Events, ChannelType } = require('discord.js');

const accessTimers = new Map();

module.exports = {
	name: Events.VoiceStateUpdate,
	once: false,
	async execute(oldState, newState, client) {
		if (oldState.channelId == newState.channelId) return;
		const categories = getCategories(newState.guild);
		const channel_ids = await Promise.all(categories.map(category => getServerShipChannels(category).then(server => server.map(channel => channel.id)))).then(ids => ids.flat());
		const relates_to_a_ship = [oldState.channelId, newState.channelId].some(ship_channel_id => channel_ids.includes(ship_channel_id));
		if (!relates_to_a_ship) return;
		const joined_a_ship = channel_ids.includes(newState.channelId);
		const left_a_ship = channel_ids.includes(oldState.channelId);

		if (joined_a_ship && !left_a_ship) joinedShip(newState);
		if (!joined_a_ship && left_a_ship) leftShip(oldState, { RECONNECT_MS: client.config.Settings.RECONNECT_MS });
		if (joined_a_ship && left_a_ship) movedShip(oldState, newState);
	},
};


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

function leftShip(state, options) {
	const server_number = state.channel.name.match(/\d+/)[0];
	const sota_role = state.guild.roles.cache.find(role => role.name == `SOTA-${server_number}`);

	if (!options?.skipRemoveSotaRole) state.member.roles.remove(sota_role, 'Left a ship');
	if (!options?.RECONNECT_MS) return state.channel.permissionOverwrites.delete(state.member, 'Left a ship');
	accessTimers.set(`${state.channelId}:${state.member.id}`, setTimeout(() => state.channel.permissionOverwrites.delete(state.member, 'Left a ship'), options.RECONNECT_MS));
}

function movedShip(oldState, newState) {
	const [old_server_number, new_server_number] = [oldState, newState].map(state => state.channel.name.match(/\d+/)[0]);

	joinedShip(newState);
	if (old_server_number == new_server_number) return leftShip(oldState, { skipRemoveSotaRole: true });
	leftShip(oldState);
}