const { ChannelType } = require('discord.js');

module.exports = (client) => {
	client.status_updaters = new Map();
	client.guilds.cache.forEach(guild => client.status_updaters.set(guild.id, new StatusUpdater(client, guild)));
};

class StatusUpdater {
	constructor(client, guild) {
		this.client = client;
		this.guild = guild;

		const categories = this.getCategories(guild);
		this.intervals = new Map();

		this.start(categories);
	}

	async start(categories) {
		await new Promise(res => {
			this.client.on('dbConnected', () => res());
		});

		this.update = (async () => {
			categories.forEach(category => this.updateStatus(category, this.client));
		})();

		categories.forEach(category => this.intervals.set(category.server_number, setInterval(() => this.updateStatus(category), 600000)));
	}

	add(category) {
		this.intervals.set(category.server_number, setInterval(() => this.updateStatus(category), 600000));
	}

	getCategories(guild) {
		const categories = guild.channels.cache.filter(channel => channel.type === ChannelType.GuildCategory && channel.name.toLowerCase().includes('sot alliance '));
		categories.forEach(category => Object.assign(category, { server_number: category.name.match(/\d+/)[0] ?? null }));
		categories.sort((a, b) => b.server_number - a.server_number);

		return categories;
	}

	async getServerShipChannels(category) {
		return category.children.cache.filter(channel => channel.name.startsWith(`${category.server_number}-`) && !channel.name.toLowerCase().endsWith('situation room'));
	}

	async getActiveShipChannels(category) {
		return await this.getServerShipChannels(category).then(ship_channels => ship_channels.filter(channel => channel.name.match(/-(\w{1,3})]/i)?.length > 1));
	}

	async getStatusIndicator(category) {
		return category.children.cache.find(channel => channel.name.toLowerCase().includes(`server ${category.server_number}`) && !channel.name.startsWith(`${category.server_number}-`));
	}

	async updateStatus(category, client) {
		if (!category.guild.channels.cache.has(category.id)) return clearInterval(this.intervals.get(category.server_number));

		const active_ships = await this.getActiveShipChannels(category);
		const status_indicator = await this.getStatusIndicator(category);

		const formatted_ships = active_ships.map(channel => ({
			channel_id: channel.id,
			activity: channel.name.match(/(\[.*\] ?\W+)((\W?\w+)+)/i)[2] ?? '',
			ship_type: channel.name.match(/-(\w{1,3})]/i)?.length > 1 ? channel.name.match(/-(\w{1,3})]/i)[1].replace('C', '') : null,
			emissary: (channel.name.match(/\[(.+)-/i)) ? channel.name.match(/\[(.+)-/i)[1].toUpperCase() : 'unknown',
			captained: channel.name.match(/-(C\w)]/i) ? true : false,
			player_count: channel.members.filter(member => !member.roles.cache.some(role => client.config.STAFF_ROLE_NAMES.includes(role.name))).size ?? 0,
		}));

		const collection = client.mongo.collection('servers');

		collection.updateOne({ current_number: category.server_number }, { $set: { ships: formatted_ships } }, { upsert: true });

		if (!status_indicator) return;
		const new_name = (active_ships.filter(channel => !channel.name.match(/\Whid(e|den)\W/i)).size > 0) ? `🟢 SERVER ${category.server_number} [${active_ships.filter(channel => !channel.name.match(/\Whid(e|den)\W/i)).size} SHIPS]` : `🔴 SERVER ${category.server_number}`;
		if (status_indicator.name == new_name) return;
		status_indicator.setName(new_name, 'Status Indicator');
	}
}