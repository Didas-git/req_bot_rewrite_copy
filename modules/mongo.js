const { MongoClient } = require('mongodb');

module.exports = {
	init: async (client) => Object.assign(client, { mongo: await dbConnect(client) }),
	destroy: (client) => {
		if (!client.mongo) return;
		client.mongo.client.close();
		console.log('Disconnected');
	},
};

async function dbConnect(client) {
	if (!client.env.APP_MONGO_URI) return console.warn('No database URL provided');

	const dbClient = new MongoClient(client.env.APP_MONGO_URI, {
		useNewUrlParser: true,
		useUnifiedTopology: true,
	});

	try {
		console.log('Connecting to database');
		await dbClient.connect();
		const dbDatabase = dbClient.db('req-bot-v2');
		dbDatabase.client = dbClient;
		console.log('Connected to database');
		return dbDatabase;
	}

	catch (err) {
		console.error(err);
		throw err;
	}
}