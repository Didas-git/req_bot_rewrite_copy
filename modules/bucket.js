module.exports = class Bucket {
	constructor(client) {
		this._items = new Map();
		this.interval = setInterval(() => {
			const item = this._items.values().next().value;
			if (!item) return;
			this._items.delete(item.id);
			item.callback(client);
		}, client.config.Settings.BUCKET_INTERVAL);
	}

	queue(callback, id = null) {
		const sequenced = Array.from(this._items.values()).filter(item => typeof item.id === 'string' && item.id.startsWith('_'));
		const item = id ? { id, callback } : { id: `_${sequenced.length}`, callback };
		this._items.set(item.id, item);
	}

	dequeue(id) {
		this._items.delete(id);
	}

	destroy() {
		clearInterval(this.interval);
	}
};