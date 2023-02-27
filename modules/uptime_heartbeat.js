module.exports = (client) => {
	try {
		if (!client.config.Settings.HEARTBEAT_URL || client.config.Settings.HEARTBEAT_URL == '') return client.warn('HTTP', 'Invalid Heartbeat URL');
		setInterval(() => {
			return (client.config.Settings.HEARTBEAT_URL != '') ? fetch(client.config.Settings.HEARTBEAT_URL) : null;
		}, 60000);
		client.log('HTTP', 'Heartbeat Service Started');
	}

	catch (error) {
		client.error('HTTP', error);
	}
};