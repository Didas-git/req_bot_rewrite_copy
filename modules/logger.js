module.exports = (client) => {
	let guildLoggers = [];

	client.log = async (origin, message) => {
		console.log(`[${origin}] ${message}`);
		return await sendMessage({ loggers: guildLoggers, origin, message, type: 'info' });
	};

	client.warn = async (origin, message) => {
		console.warn(`[${origin}] ${message}`);
		return await sendMessage({ loggers: guildLoggers, origin, message, type: 'warn' });
	};

	client.error = async (origin, error) => {
		console.error(`[${origin}] ${error?.message ?? error}`);
		return await sendMessage({ loggers: guildLoggers, origin, message: error, type: 'error' });
	};

	client.terminal = async (message) => {
		console.log(`[TERMINAL]\n${message}`);
		return await sendMessage({ loggers: guildLoggers, origin: 'TERMINAL', message, type: 'terminal' });
	};

	if (!client.log || !client.warn || !client.error || !client.terminal) {
		console.warn('[LOGGER] Failed to initialise');
		return false;
	}

	guildLoggers = client.guilds.cache.map(guild => {
		return new Logger(client, guild);
	});

	client.log('LOGGER', `Attached to ${guildLoggers.filter(logger => logger.channel !== undefined).length} channels`);
	return true;
};

class Logger {
	constructor(client, guild) {
		this.guild = guild;
		this.channel = guild.channels.cache.find(channel => channel.name.endsWith(client.config.Settings.LOG_CHANNEL));

		if (!this.channel) {
			return client.config.Settings.VERBOSE ? client.warn('LOGGER', `Unable to attach to channel in ${guild.name} (${guild.id})`) : false;
		}

		return true;
	}
}

function sendMessage(args) {
	if (!args['loggers'] || args['message'] == 'null' || !args['message']) { return false; }

	const type = args['type'].toUpperCase();

	if (type == 'TERMINAL') {
		return args['loggers'].filter(logger => logger.channel).forEach(logger => logger.channel.send(`>>> **\`INFO\` \`${type}\`**\n\`\`\`prolog\n${args['message']}\`\`\``).catch(e => console.error(e)));
	}

	const message = (args['message'] instanceof Error) ? `\`\`\`js\n${args['message']}\n\`\`\`` : args['message'];

	return args['loggers'].filter(logger => logger.channel).forEach(async logger => {
		if (!logger.guild.channels.cache.has(logger.channel.id)) {
			console.warn(`Logger channel in guild '${logger.guild.name}' (${logger.guild.id}) was not cached!`);
			logger.channel = await logger.guild.channels.fetch(logger.channel.id).catch(e => console.error(e));
		}

		return logger.channel.send(`>>> **\`${type}\` \`${args['origin']}\`**\n${message}`);
	});
}