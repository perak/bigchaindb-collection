const BDBDriver = require("bigchaindb-driver");
const WebSocket = require("ws");
const bip39 = require("bip39");


export class BDBConnection {
	constructor(options = {}) {
		this.collections = {};
		this.transactionCallbacks = [];
		this.onKeypairRequest = null;
		this.socketBroken = false;
		this.reconnectCount = 0;

		this._init(options);
	}

	_init(options = {}) {
		this.socket = null;

		this.options = {
			url: options ? options.url || "" : "",
			eventsUrl: options ? options.eventsUrl || "" : "",
			namespace: options ? options.namespace || "" : "",
			appId: options ? options.appId || "" : "",
			appKey: options ? options.appKey || "" : ""
		};

		this.connection = null;
	}

	connect(options = {}, cb) {
		var self = this;

		if(options) {
			this._init(options);
		}

		if(!this.options.url) {
			let errorMsg = "ERROR: BigchainDB API URL is not set.";
			if(cb) {
				cb(new Error(errorMsg));
			} else {
				console.log(errorMsg);
			}
		}

		var headers = {};
		if(this.options.appId) {
			headers.app_id = this.options.appId;
		}
		if(this.options.appKey) {
			headers.app_key = this.options.appKey;
		}

		this.connection = new BDBDriver.Connection(this.options.url, headers);

		if(this.options.eventsUrl) {
			this.listenEvents(cb);

			Meteor.setInterval(() => {
				if(self.socketBroken) {
					if(!(self.reconnectCount % 1000)) {
						console.log("BDB WebSocket connection is broken. Reconnecting...");
					}
					self.reconnectCount++;
					self.listenEvents(cb);
				}
			}, 10);
		}
	}

	registerCollection(collection) {
		let coll = null;
		if(typeof collection == "string") {
			coll = global[collection];
		} else {
			coll = collection;
		}
		if(coll) {
			coll.bdbConnection = this;
			this.collections[coll._name] = coll;
		}
	}

	listenEvents(cb) {
		let self = this;

		try {
			this.socket = new WebSocket(this.options.eventsUrl);
		} catch(e) {
			if(cb) {
				cb(e);
			} else {
				console.log(e);
			}
			return;
		}

		this.socket.onmessage = Meteor.bindEnvironment((e) => {
			let data = {};
			try {
				data = JSON.parse(e.data);
			} catch(err) {
				if(cb) {
					cb(err);
				} else {
					console.log(err);
				}
				return;
			}

			self.connection.getTransaction(data.transaction_id).then(Meteor.bindEnvironment((trans) => {
				let record = trans && trans.asset && trans.asset.data ? trans.asset.data : null;
				if(record) {
					let collection = null;
					for(let key in self.collections) {
						let coll = self.collections[key];
						let nsField = coll._namespaceField;
						let ns = coll.getNamespace();
						if(record[nsField] == ns) {
							collection = coll;
							break;
						}
					}

					if(collection) {
						let found = collection.findOne({ $or: [ { _id: record._id }, { _assetId: trans.id } ] });
						if(!found) {
							record._assetId = trans.id;
							record._transactionId = trans.id;
							record._transactionStatus = "ok";
							collection.insert(record);
						}
					}
				}

				self.transactionCallbacks.map(function(transactionCallback) {
					transactionCallback(data, trans);
				});
			}));
		});

		this.socket.onopen = function(e) {
			self.socketBroken = false;
			self.reconnectCount = 0;
		};

		this.socket.onerror = function(e) {
			if(!(self.reconnectCount % 1000)) {
				console.log("BigchainDB WebSocket error. Type: \"" + e.type + "\".");
			}
		};

		this.socket.onclose = function(e) {
			if(e.code == 1000) {
				// normally closed
				return;
			} else {
				if(!(self.reconnectCount % 1000)) {
					console.log("BigchainDB WebSocket connection closed. Code: " + e.code + ", reason: \"" + e.reason + "\".", e.code, e.reason);
				}
				self.socketBroken = true;
			}

		};
	}

	keypairFromPassword(password) {
		return new BDBDriver.Ed25519Keypair(bip39.mnemonicToSeed(password).slice(0, 32));
	}

	createTransaction(data, publicKey, privateKey, cb) {
		let self = this;
		const tx = BDBDriver.Transaction.makeCreateTransaction(
			data,
			null,
			[
				BDBDriver.Transaction.makeOutput(BDBDriver.Transaction.makeEd25519Condition(publicKey))
			],
			publicKey
		);

		const txSigned = BDBDriver.Transaction.signTransaction(tx, privateKey);

		self.connection.postTransaction(txSigned).then(() => {
			self.connection.pollStatusAndFetchTransaction(txSigned.id).then((retrievedTx) => {
				if(cb) {
					cb(null, retrievedTx);
				}
			});
		});
	}

	onTransaction(cb) {
		this.transactionCallbacks.push(cb);
	}
}


export class BDBCollection extends Mongo.Collection {
	constructor(name, options) {
		super(name, options);

		let self = this;

		this._namespaceField = options ? options.namespaceField || "_namespace" : "_namespace";
		this._namespace = options ? options.namespace : null;

		if(Meteor.isServer) {

			this.before.insert(function(userId, doc) {
				if(doc._transactionId) {
					return;
				}

				doc.createdAt = new Date();
				doc.createdBy = userId || null;

				doc._assetId = null;
				doc._transactionId = null;
				doc._transactionStatus = "pending";
			});

			this.after.insert(function(userId, doc) {
				if(!self.bdbConnection || !self.bdbConnection.connection) {
					console.log("BigchainDB Collection \"" + self._name + "\" is not registered or no connection to BigchainDB server.");
					return;
				}

				if(!doc || doc._transactionId) {
					return;
				}

				let payload = JSON.parse(JSON.stringify(doc));
				delete payload._assetId;
				delete payload._transactionId;
				delete payload._transactionStatus;
				payload[self._namespaceField] = self.getNamespace();

				let keypair = null;
				if(self.bdbConnection.onKeypairRequest) {
					keypair = self.bdbConnection.onKeypairRequest(userId, self._name, payload);
				} else {
					throw new Meteor.Error(500, "Cannot get BigchainDB keypair. Please set BDBConnection.onKeyPairRequest function.");
				}

				const tx = BDBDriver.Transaction.makeCreateTransaction(
					payload,
					null,
					[
						BDBDriver.Transaction.makeOutput(BDBDriver.Transaction.makeEd25519Condition(keypair.publicKey))
					],
					keypair.publicKey
				);

				const txSigned = BDBDriver.Transaction.signTransaction(tx, keypair.privateKey);

				self.bdbConnection.connection.postTransaction(txSigned).then(() => {
					self.bdbConnection.connection.pollStatusAndFetchTransaction(txSigned.id).then((retrievedTx) => {
						self.update({ _id: payload._id }, { $set: { 
							_assetId: retrievedTx.id,
							_transactionId: retrievedTx.id,
							_transactionStatus: "ok"
						} });
					});
				});
			});
		}
	}

	getNamespace() {
		let namespace = "";
		if(this._namespace) {
			namespace = this._namespace;
		} else {
			if(this.bdbConnection.options.namespace) {
				namespace = this.bdbConnection.options.namespace + "::" + this._name;
			} else {
				namespace = this._name;
			}
		}
		return namespace;
	}
}
