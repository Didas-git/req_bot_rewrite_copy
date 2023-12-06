const redis = require('redis');
const client = redis.createClient({
	url: process.env.REDIS_URL,
});

client.on('error', (err) => console.error(err));
client.on('connect', () => console.log('Redis connected'));
client.on('ready', async () => {
	console.log('Redis ready');
	client.get('state:alliance_locked', (err, reply) => console.log(reply));
	const locked = await client.get('state:alliance_locked');
	console.log(locked);
});
client.on('end', () => console.log('Redis disconnected'));

process.on('SIGINT', () => client.quit());

client.connect();

module.exports = client;