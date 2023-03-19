module.exports = class Bucket {
	constructor(client) {
		this._items = new Map();
		this.client = client;
		this.last_event_id = 0;
	}

	queue(callback, options = {}) {
		if (this._items.size == 0) this.last_event_id = 0;
		const { id, weight = 0 } = options;

		const item = id ? { id, weight, callback, event_id: this.last_event_id } : { id: `_${this.last_event_id}`, callback, weight, event_id: this.last_event_id };
		this.last_event_id++;

		this._items.set(item.id, item);
		this._items = new Map([...this._items.entries()].sort((a, b) => a[1].weight - b[1].weight));

		return new Promise(res => item.resolve = res);
	}

	dequeue(id) {
		this._items.delete(id);
	}

	clear() {
		this._items.clear();
	}

	del(id) {
		this._items.delete(id);
	}

	get(id) {
		if (!id) return this._items;
		return this._items.get(id).callback;
	}

	start() {
		this.interval = setInterval(async () => {
			const item = this._items.values().next().value;
			if (!item) return;
			this._items.delete(item.id);
			item.callback().then(res => item.resolve(res));
		}, this.client.config.Settings.BUCKET_INTERVAL);
	}


	stop() {
		clearInterval(this.interval);
	}

	destroy() {
		clearInterval(this.interval);
		this.clear();
	}
};