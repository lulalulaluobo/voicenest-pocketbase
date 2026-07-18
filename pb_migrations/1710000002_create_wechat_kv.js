migrate((app) => {
  const collection = {
    "name": "wechat_kv",
    "type": "base",
    "system": false,
    "schema": [
      {
        "name": "key",
        "type": "text",
        "required": true,
        "presentable": false,
        "unique": true,
        "options": {
          "min": 1,
          "max": null,
          "pattern": ""
        }
      },
      {
        "name": "value",
        "type": "text",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {
          "min": null,
          "max": null,
          "pattern": ""
        }
      }
    ],
    "indexes": [
      "CREATE UNIQUE INDEX idx_wechat_kv_key ON wechat_kv(key)"
    ],
    "listRule": null,
    "viewRule": null,
    "createRule": null,
    "updateRule": null,
    "deleteRule": null,
    "options": {}
  };

  return app.importCollections([collection], false);
}, (app) => {
  try {
    const collection = app.findCollectionByNameOrId("wechat_kv");
    return app.delete(collection);
  } catch (_) {
    return null;
  }
});
