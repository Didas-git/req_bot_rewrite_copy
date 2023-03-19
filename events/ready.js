const { ActivityType, PresenceUpdateStatus, Events, REST, Routes } = require('discord.js');
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);
const moment = require('moment');
const Bucket = require('../modules/bucket.js');

module.exports = {
	name: Events.ClientReady,
	once: true,
	async execute(client) {
		client.state = 2;
		client.timeouts = new Map();

		// Attach config to client.config
		require(client.root + '/modules/config.js').attach(client);

		// Attach restart service to client.restart
		client.restart = require(client.root + '/modules/restart.js');

		client.user.setPresence({
			activities: [{
				name: `v${client.build['version']}`,
				type: ActivityType.Streaming,
			}],

			status: PresenceUpdateStatus.Online,
		});

		console.log(`[CLIENT] Connected to ${client.guilds.cache.size} guilds with a total of ${client.guilds.cache.reduce((a, guild) => a + guild.memberCount, 0)} members\n`);

		const table = {};

		client.guilds.cache.forEach(guild => {
			table[guild.id] = ({
				'Guild Name': guild.name,
				'Member Count': guild.members.cache.filter(member => !member.user.bot).size,
				'Bot Count': guild.members.cache.filter(member => member.user.bot).size,
				'Joined': moment(guild.members.cache.find(member => member.id === client.user.id).joinedAt).fromNow(),
			});
		});

		console.table(table);
		console.log();

		const logger_status = require(client.root + '/modules/logger.js')(client);

		// Fallback if unable to initialise logger
		if (!logger_status) {
			client.log = console.log;
			client.warn = console.warn;
			client.error = console.error;
		}

		// Start updating alliance status indicators
		require(client.root + '/modules/alliance_indicators.js')(client);

		// Create HTTP server for uptime tracking
		require(client.root + '/modules/uptime_heartbeat.js')(client);

		// Generate JSON and push commands to Discord
		register_commands(client);

		// Check if an update just happened and provide feedback
		const updateHelper = require(client.root + '/modules/updateHelper.js');
		if (updateHelper.get()) {
			updateHelper.get().editReply(`Update successful, I'm on v${client.build['version']}`);
			updateHelper.set(undefined);
		}

		// Start the bucket service
		client.bucket = new Bucket(client);
	},
};

async function register_commands(client) {
	try {
		const plurals = [client.commands.size > 1 ? 's' : '', client.guilds.cache.size > 1 ? 's' : ''];
		client.log('COMMANDS', `Updating ${client.commands.size} command${plurals[0]} across ${client.guilds.cache.size} guild${plurals[1]}`);

		const promises = client.guilds.cache.map(async (guild) => {
			const promise = await rest.put(
				Routes.applicationGuildCommands(client.user.id, guild.id),
				{ body: Array.from(client.commands.values()).map(object => object.data) },
			);

			return promise.length;
		});

		const guild_updates = await Promise.all(promises);
		const total_updates = guild_updates.reduce((a, c) => a + c);

		plurals[2] = total_updates > 1 ? 's' : '';
		client.log('COMMANDS', `Updated ${total_updates} command${plurals[2]} in total`);
		client.log('CLIENT', `${client.build.name} v${client.build.version} ready`);
		client.state = 3;
	}

	catch (error) {
		client.error('COMMANDS', error);
	}
}