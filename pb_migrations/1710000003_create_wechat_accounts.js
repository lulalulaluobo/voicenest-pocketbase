migrate((app) => {
  const collection = {
    "name": "wechat_accounts",
    "type": "base",
    "system": false,
    "schema": [
      {
        "name": "owner",
        "type": "relation",
        "required": true,
        "presentable": false,
        "unique": true,
        "options": {
          "collectionId": "_pb_users_auth_",
          "cascadeDelete": true,
          "minSelect": 1,
          "maxSelect": 1,
          "displayFields": null
        }
      },
      {
        "name": "appId",
        "type": "text",
        "required": true,
        "presentable": false,
        "unique": false,
        "options": {
          "min": 1,
          "max": null,
          "pattern": ""
        }
      },
      {
        "name": "encryptedSecret",
        "type": "text",
        "required": true,
        "presentable": false,
        "unique": false,
        "hidden": true, // 从 API 返回结果中彻底隐藏此字段
        "options": {
          "min": 1,
          "max": null,
          "pattern": ""
        }
      },
      {
        "name": "lastVerifiedAt",
        "type": "date",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {
          "min": "",
          "max": ""
        }
      }
    ],
    "indexes": [
      "CREATE UNIQUE INDEX idx_wechat_accounts_owner ON wechat_accounts(owner)"
    ],
    "listRule": "@request.auth.id = owner",
    "viewRule": "@request.auth.id = owner",
    "createRule": "@request.auth.id = owner",
    "updateRule": "@request.auth.id = owner",
    "deleteRule": "@request.auth.id = owner",
    "options": {}
  };

  return app.importCollections([collection], false);
}, (app) => {
  try {
    const collection = app.findCollectionByNameOrId("wechat_accounts");
    return app.delete(collection);
  } catch (_) {
    return null;
  }
});
