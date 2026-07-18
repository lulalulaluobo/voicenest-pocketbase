// 将 users 集合的 email 字段从必填 (required) 改为选填，
// 使注册时仅需用户名和密码即可完成。
migrate((app) => {
  const collection = app.findCollectionByNameOrId("users");
  if (!collection) return;

  // PocketBase v0.23+ 的 Auth 集合将 email 存储在 collection 的顶级属性中
  // 但 required 约束是通过 fields 数组里的 email 字段控制的
  const fields = collection.fields;
  for (let i = 0; i < fields.length; i++) {
    if (fields[i].name === "email") {
      fields[i].required = false;
      break;
    }
  }
  collection.fields = fields;
  app.save(collection);
  console.log("[VoiceNest] 已将 users.email 字段设为选填 (非必填)");
}, (app) => {
  // down: 还原为必填
  const collection = app.findCollectionByNameOrId("users");
  if (!collection) return;
  const fields = collection.fields;
  for (let i = 0; i < fields.length; i++) {
    if (fields[i].name === "email") {
      fields[i].required = true;
      break;
    }
  }
  collection.fields = fields;
  app.save(collection);
});
