Package.describe({
  name: "bigchaindb-collection",
  version: "0.0.1",
  // Brief, one-line summary of the package.
  summary: "Use BigchainDB in your Meteor application just like you are using Mongo",
  // URL to the Git repository containing the source code for this package.
  git: "",
  // By default, Meteor will default to using README.md for documentation.
  // To avoid submitting documentation, set this field to null.
  documentation: "README.md"
});

Package.onUse(function(api) {
  api.versionsFrom("1.6.1");
  api.use("ecmascript");

  api.use("mongo");
  api.use("matb33:collection-hooks");

  api.mainModule("bigchaindb-collection.js");
});

Package.onTest(function(api) {
  api.use("ecmascript");
  api.use("tinytest");
  api.use("bigchaindb-collection");
  api.mainModule("bigchaindb-collection-tests.js");
});

Npm.depends({
    "bigchaindb-driver": "3.2.0",
    "bip39": "2.5.0",
    "bufferutil": "3.0.3",
    "utf-8-validate": "4.0.0",
    "ws": "4.0.0"
});
