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

		this.update = (async () => {
			categories.forEach(category => this.updateStatus(category));
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

	async updateStatus(category) {
		if (!category.guild.channels.cache.has(category.id)) return clearInterval(this.intervals.get(category.server_number));

		const active_ships = await this.getActiveShipChannels(category);
		const status_indicator = await this.getStatusIndicator(category);
		const new_name = (active_ships.size > 0) ? `🟢 SERVER ${category.server_number} [${active_ships.size} SHIPS]` : `🔴 SERVER ${category.server_number}`;
		if (status_indicator.name == new_name) return;
		status_indicator.setName(new_name, 'Status Indicator');
	}
}