module.exports = (client) => {
	try {
		client.http = require('http').createServer((req, res) => {
			if (client.config.Settings.VERBOSE) {client.log('HTTP', `Request received from **${req.headers['x-forwarded-for'] ?? req.socket.remoteAddress}**`); }
			res.end('Alive');
		}).listen(client.config.Settings.LISTEN_PORT);
		client.log('HTTP', 'Listening to requests');
	}

	catch (error) {
		client.error('HTTP', error);
	}
};