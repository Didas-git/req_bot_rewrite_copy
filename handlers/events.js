module.exports = (({ client, fs }) => {
	const eventsDir = client.root + '/events';
	const eventFiles = fs.readdirSync(eventsDir).filter(file => file.endsWith('.js'));

	eventFiles.forEach(file => {
		const event = require(`${eventsDir}/${file}`);

		if (event.once) { return client.once(event.name, (...eventArgs) => event.execute(...eventArgs, client)); }
		client.on(event.name, (...eventArgs) => event.execute(...eventArgs, client));
	});
});