migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("users");

  collection.schema.addField(new SchemaField({
    name: "asrConfig",
    type: "json"
  }));
  collection.schema.addField(new SchemaField({
    name: "llmConfig",
    type: "json"
  }));
  collection.schema.addField(new SchemaField({
    name: "syncConfig",
    type: "json"
  }));
  collection.schema.addField(new SchemaField({
    name: "noteTypes",
    type: "json"
  }));
  collection.schema.addField(new SchemaField({
    name: "wechatDraftConfig",
    type: "json"
  }));
  collection.schema.addField(new SchemaField({
    name: "wechatPromptTemplates",
    type: "json"
  }));
  collection.schema.addField(new SchemaField({
    name: "audioRetention",
    type: "text"
  }));
  collection.schema.addField(new SchemaField({
    name: "textRetention",
    type: "text"
  }));

  return dao.saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("users");
  
  const fields = [
    "asrConfig", "llmConfig", "syncConfig", "noteTypes", 
    "wechatDraftConfig", "wechatPromptTemplates", "audioRetention", "textRetention"
  ];
  for (const name of fields) {
    const field = collection.schema.getFieldByName(name);
    if (field) {
      collection.schema.removeField(field.id);
    }
  }
  return dao.saveCollection(collection);
})
