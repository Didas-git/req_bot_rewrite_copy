require('dotenv').config();

const _config = {
	config: require('../config.json'),
	build: require('../package.json'),
	env: process.env,
};

module.exports = { ..._config, ...{ attach: (client) => {
	Object.assign(client, _config);
	Object.assign(client, { _config: JSON.parse(JSON.stringify(_config.config)) });
	Object.freeze(client._config);
} } };