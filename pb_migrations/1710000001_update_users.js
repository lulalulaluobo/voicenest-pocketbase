// v0.23+ 迁移签名：migrate((app) => {...}, (app) => {...})
//
// v0.22 的 SchemaField + collection.schema.addField(...) 已废弃。
// v0.23+ 改用具体字段类型构造器（JSONField / TextField 等），
// 并通过 collection.fields.add(...) 添加（FieldsList 的方法名是 add，不是 addField）。
// 字段查询用 collection.fields.getByName()（不是 getFieldByName）。
migrate((app) => {
  const collection = app.findCollectionByNameOrId("users");

  collection.fields.add(new JSONField({ name: "asrConfig" }));
  collection.fields.add(new JSONField({ name: "llmConfig" }));
  collection.fields.add(new JSONField({ name: "syncConfig" }));
  collection.fields.add(new JSONField({ name: "noteTypes" }));
  collection.fields.add(new JSONField({ name: "wechatDraftConfig" }));
  collection.fields.add(new JSONField({ name: "wechatPromptTemplates" }));
  collection.fields.add(new TextField({ name: "audioRetention" }));
  collection.fields.add(new TextField({ name: "textRetention" }));

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("users");

  const names = [
    "asrConfig", "llmConfig", "syncConfig", "noteTypes",
    "wechatDraftConfig", "wechatPromptTemplates", "audioRetention", "textRetention"
  ];
  for (const name of names) {
    collection.fields.removeByName(name);
  }
  return app.save(collection);
});
