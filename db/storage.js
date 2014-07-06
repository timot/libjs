'use strict';

function DBInstance(db) {
	this.db = db;
	this.store_name = null;
	this.index_name = null;
}

DBInstance.prototype.__update_store = function(type, data) {
	var store_name = this.store_name, index_name = this.index_name;

	return new Promise(function(resolve, reject) {
		var multiple_inserts = Array.isArray(data),
			result = [],
			trans = this.db.transaction(store_name, 'readwrite'),
			store = trans.objectStore(store_name);

		if ( index_name ) {
			store = store.index(index_name);
		}

		trans.addEventListener('complete', function() {
			if ( multiple_inserts ) {
				resolve(result);
			} else {
				resolve(result.pop());
			}
		});

		trans.addEventListener('error', function(evt) {
			reject(evt.target.error);
		});

		if ( !multiple_inserts ) {
			data = [data];
		}

		data.forEach(function(item) {
			store[type](item).addEventListener('success', function(evt) {
				if ( evt.target.source.keyPath ) {
					item[evt.target.source.keyPath] = evt.target.result;
				} else {
					item.__key = evt.target.result;
				}
				result.push(item);
			});
		});
	}.bind(this));
};

DBInstance.prototype.store = function(name) {
	this.store_name = name;
	this.index_name = null;
	return this;
};

DBInstance.prototype.index = function(name) {
	this.index_name = name;
	return this;
};

DBInstance.prototype.iterate = function(options, value1, value2, iterator) {
	var store_name = this.store_name, index_name = this.index_name;

	return new Promise(function(resolve, reject) {
		var trans = this.db.transaction(store_name, 'readwrite'),
			store = trans.objectStore(store_name),
			range, result = [];

		if ( index_name ) {
			store = store.index(index_name);
		}

		trans.addEventListener('complete', function() {
			if ( options.range === 'only' ) {
				result = result[0] || null;
			}
			resolve(result);
		});

		trans.addEventListener('error', function(evt) {
			reject(evt.target.error);
		});

		if ( Object.prototype.toString.call(options) === '[object Function]' ) {
			value1 = options;
			options = {};
		}

		options = options || {};
		switch ( options.range ) {
			case 'only':
				range = window.IDBKeyRange.only(value1);
				iterator = value2;
			break;
			case 'lower':
				range = window.IDBKeyRange.lowerBound(value1, options.include_lower || true);
				iterator = value2;
			break;
			case 'upper':
				range = window.IDBKeyRange.upperBound(value1, options.include_upper || true);
				iterator = value2;
			break;
			case 'lowerupper':
				range = window.IDBKeyRange.bound(value1, value2, options.include_lower || true, options.include_upper || true);
				iterator = iterator;
			break;
			default:
				iterator = value1;
		}

		if ( Object.prototype.toString.call(iterator) !== '[object Function]' ) {
			iterator = false;
		}

		store.openCursor(range, options.direction || 'next').addEventListener('success', function(evt) {
			var iterator_result, cursor = evt.target.result;
			if ( cursor === undefined || cursor === null ) {
				return cursor;
			}

			if ( iterator === false ) {
				if ( cursor.source.keyPath === null ) {
					cursor.value.__key = cursor.key;
				}
				result.push(cursor.value);
				cursor.continue();
			} else {
				iterator_result = iterator(cursor.value, cursor.key, result);
				if ( iterator_result !== true ) {
					cursor.continue();
				}
			}
		});
	}.bind(this));
};

DBInstance.prototype.get = function(id) {
	if ( !Array.isArray(id) ) {
		return this.iterate({range: 'only'}, id);
	} else if ( id.length < 2 ) {
		return this.iterate({range: 'only'}, id[0]);
	} else {
		id.sort();
		return this.iterate({range: 'lower_upper'}, id[0], id[id.length - 1]);
	}
};

DBInstance.prototype.add = function(data) {
	return this.__update_store('add', data);
};

DBInstance.prototype.put = function(data) {
	return this.__update_store('put', data);
};

DBInstance.prototype.delete = function(data) {
	return this.__update_store('delete', data);
};

export function create(name, config) {
	return new Promise(function(resolve, reject) {
		var request = window.indexedDB.open(name, config.version);

		request.addEventListener('upgradeneeded', function(evt) {
			var db = evt.target.result;

			config.stores.forEach(function(store) {
				var object_store;
				if(db.objectStoreNames.contains(store.name)) {
					if ( store.options !== undefined ) {
						db.deleteObjectStore(store.name);
						object_store = db.createObjectStore(store.name, store.options);
					}
				} else {
					object_store = db.createObjectStore(store.name, store.options);
				}

				if ( store.index ) {
					store.index.forEach(function(index) {
						object_store.createIndex(index.name, index.name, {unique: index.unique});
					});
				}
			});
		});

		request.addEventListener('success', function(evt) {
			resolve(new DBInstance(evt.target.result));
		});

		request.addEventListener('error', function(evt) {
			reject(evt.target.error);
		});
	});
}

function load(name) {
	return new Promise(function(resolve, reject) {
		var request = window.indexedDB.open(name);

		request.addEventListener('success', function(evt) {
			if ( evt.target.result.objectStoreNames.length === 0 ) {
				reject(new Error('No store is found'));
			} else {
				resolve(new DBInstance(evt.target.result));
			}
		});

		request.addEventListener('error', function(evt) {
			reject(evt.target.error);
		});
	});
}

function deleteDatabase(name) {
	return new Promise(function(resolve, reject) {
		var request = window.indexedDB.deleteDatabase(name);

		request.addEventListener('success', resolve);

		request.addEventListener('error', function(evt) {
			reject(evt.target.error);
		});
	});
}

export var storage = {
	load: load,
	create: create,
	delete: deleteDatabase
};
