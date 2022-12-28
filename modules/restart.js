module.exports = async (client) => {
	client.state = 0;

	// Close current session
	if (client.http) { client.http.close(); }
	await client.destroy();

	// Unload all files except for this current file
	Object.keys(require.cache).forEach(file => {
		if (!file.endsWith(__filename) && !file.endsWith('updateHelper.js')) { delete require.cache[require.resolve(file)]; }
	});

	// Load index.js again
	require(client.root + '/index.js');
};