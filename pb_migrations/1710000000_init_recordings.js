// v0.23+ 迁移签名：migrate((app) => {...}, (app) => {...})
//
// 与 v0.22 的关键差异（已通过 PocketBase 0.27 实测）：
//   1. collection 字段声明键名从 "schema" 改为 "fields"
//   2. 字段的配置项（如 relation 的 collectionId、file 的 maxSize/mimeTypes）
//      从 options 子对象提升到字段对象顶层
//   3. importCollections 创建集合时支持规则引用 fields 中的字段（只要字段结构正确即可）
migrate((app) => {
  const collection = {
    "name": "recordings",
    "type": "base",
    "fields": [
      {
        "name": "userId",
        "type": "relation",
        "required": true,
        "collectionId": "_pb_users_auth_",
        "cascadeDelete": true,
        "minSelect": 1,
        "maxSelect": 1
      },
      { "name": "localId", "type": "text" },
      { "name": "typeId", "type": "text" },
      { "name": "typeName", "type": "text" },
      { "name": "durationMs", "type": "number" },
      { "name": "mimeType", "type": "text" },
      { "name": "status", "type": "text" },
      { "name": "recovered", "type": "bool" },
      { "name": "interrupted", "type": "bool" },
      { "name": "localTitle", "type": "text" },
      { "name": "transcript", "type": "text" },
      { "name": "summary", "type": "text" },
      { "name": "errorMessage", "type": "text" },
      { "name": "isAudioCleared", "type": "bool" },
      {
        "name": "audio",
        "type": "file",
        "maxSelect": 1,
        "maxSize": 104857600, // 100MB
        // 精确匹配 src/lib/audio-mime.ts 的全部候选（含 ;codecs= 变体）。
        // PocketBase mimeTypes 是精确字符串匹配，不能只写 "audio/webm"，
        // 否则 audio/webm;codecs=opus 会被拒绝，破坏现有录音上传。
        "mimeTypes": [
          "audio/ogg;codecs=opus",
          "audio/ogg",
          "audio/webm;codecs=opus",
          "audio/webm",
          "audio/mp4;codecs=mp4a.40.2",
          "audio/mp4"
        ]
      },
      { "name": "wechatStatus", "type": "text" },
      { "name": "wechatDraftMediaId", "type": "text" },
      { "name": "wechatErrorMessage", "type": "text" },
      { "name": "wechatRequestId", "type": "text" },
      { "name": "wechatTitle", "type": "text" },
      { "name": "wechatMarkdown", "type": "text" }
    ],
    "listRule": "@request.auth.id != '' && userId = @request.auth.id",
    "viewRule": "@request.auth.id != '' && userId = @request.auth.id",
    "createRule": "@request.auth.id != '' && userId = @request.auth.id",
    "updateRule": "@request.auth.id != '' && userId = @request.auth.id",
    "deleteRule": "@request.auth.id != '' && userId = @request.auth.id"
  };

  return app.importCollections([collection], false);
}, (app) => {
  try {
    const collection = app.findCollectionByNameOrId("recordings");
    return app.delete(collection);
  } catch (_) {
    return null;
  }
});
