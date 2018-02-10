# BigchainDB Collection

Use [BigchainDB](https://www.bigchaindb.com/) (scalable blockchain database) in your [Meteor](https://www.meteor.com) application just like you are using Mongo.


## Project stage

Experimental.


## Magic behind the scenes

Your application is still reading and writing to Mongo. Anything you write into Mongo is automatically written into BigchainDB in the background (triggered by after.insert hooks). And vice versa: Anything that is written directly into BigchainDB is written into Mongo (triggered by BDB event stream).

**In short, Mongo database acts as a buffer between your application and BigchainDB database.**

- You can mix/join "off-chain" and "on-chain" data

- Database writes are "reactive" (changes are instantly visible to all subscribed clients).

- You can change any existing Meteor application to use BigchainDB with minimal code modifications (partly or entirelly).


## Usage

**Step 1**

Add `perak:bigchaindb-collection` package to your application

```
meteor add perak:bigchaindb-collection
```

**Step 2**

In both client and server scope, instead defining your collection as `new Mongo.Collection` define it as `new BDBCollection`

```javascript

export const Fruits = new BDBCollection("fruits");

```


**Step 3**

In server scope, define `BDBConnection` (not to be confused with `BDBCollection`), register your collections with the connection, provide keypair generator function and connect to BDB server:

```javascript

import { Fruits } from "path to file where your collection is defined";

// define BDB connection
global.BDBC = BDBConection = new BDBConnection({ namespace: "test-app" });

// register all your BDB collections with the BDB connection
BDBC.registerCollection(Fruits);

// provide keypair generator
BDBC.onKeypairRequest = function(userId, collectionName, doc) {
	// Return keypair which will be used to sign BDB transaction.
	// Most likely you will keep user's keypair in Meteor.users collection
	// and here you can retrieve it based on userId argument.
	// But, for purpose of this demo, let's generate dummy keypair
	// based on fixed password
	return BDBC.keypairFromPassword("password");
};

Meteor.startup({
	BDBC.connect({
		"url": "http://localhost:9984/api/v1/",
		"eventsUrl": "ws://0.0.0.0:9985/api/v1/streams/valid_transactions",
		"appId": "",
		"appKey": "",
		"namespace": "test-app"
	});
});

```

And... voilà! Your application is now storing data in BigchainDB - the scalable blockchain database.


*To be continued...*
