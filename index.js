const { Client, GatewayIntentBits } = require('discord.js');
const { build, env } = require('./modules/config.js');
const fs = require('node:fs');


const client = new Client({
	intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildPresences],
});

client.root = __dirname;

console.log(`\n[CLIENT] Loading ${build.name} v${build.version}`);

const handlersDir = __dirname + '/handlers';
const handlerFiles = fs.readdirSync(handlersDir).filter(file => file.endsWith('.js'));

handlerFiles.forEach(file => {
	require(`${handlersDir}/${file}`)({ client, fs });
});

// Spylon Check
if (!env.DISCORD_BOT_TOKEN) {
	throw new Error('[CLIENT] Missing Token');
}

client.login(env.DISCORD_BOT_TOKEN);
client.state = 1;