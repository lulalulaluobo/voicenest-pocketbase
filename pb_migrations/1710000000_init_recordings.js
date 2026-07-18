migrate((db) => {
  const collection = new Collection({
    name: "recordings",
    type: "base",
    schema: [
      {
        name: "userId",
        type: "relation",
        required: true,
        options: {
          maxSelect: 1,
          collectionId: "_pb_users_auth_",
          cascadeDelete: true
        }
      },
      { name: "localId", type: "text" },
      { name: "typeId", type: "text" },
      { name: "typeName", type: "text" },
      { name: "durationMs", type: "number" },
      { name: "mimeType", type: "text" },
      { name: "status", type: "text" },
      { name: "recovered", type: "bool" },
      { name: "interrupted", type: "bool" },
      { name: "localTitle", type: "text" },
      { name: "transcript", type: "text" },
      { name: "summary", type: "text" },
      { name: "errorMessage", type: "text" },
      { name: "isAudioCleared", type: "bool" },
      {
        name: "audio",
        type: "file",
        options: {
          maxSelect: 1,
          maxSize: 104857600, // 100MB
          mimeTypes: []
        }
      },
      { name: "wechatStatus", type: "text" },
      { name: "wechatDraftMediaId", type: "text" },
      { name: "wechatErrorMessage", type: "text" },
      { name: "wechatRequestId", type: "text" },
      { name: "wechatTitle", type: "text" },
      { name: "wechatMarkdown", type: "text" }
    ],
    listRule: "@request.auth.id != '' && userId = @request.auth.id",
    viewRule: "@request.auth.id != '' && userId = @request.auth.id",
    createRule: "@request.auth.id != '' && userId = @request.auth.id",
    updateRule: "@request.auth.id != '' && userId = @request.auth.id",
    deleteRule: "@request.auth.id != '' && userId = @request.auth.id",
  });
  return Dao(db).saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  try {
    const collection = dao.findCollectionByNameOrId("recordings");
    return dao.deleteCollection(collection);
  } catch (_) {
    return null;
  }
})
