const redis = require('redis');
const client = redis.createClient({
	url: process.env.REDIS_URL,
});

client.on('error', (err) => console.error(err));
client.on('connect', () => console.log('Redis connected'));
client.on('ready', async () => console.log(locked));
client.on('end', () => console.log('Redis disconnected'));

process.on('SIGINT', () => client.quit());

client.connect();

module.exports = client;