let _interaction = undefined;

module.exports = {
	get: () => { return _interaction || undefined; },
	set: (input) => { _interaction = input; },
};