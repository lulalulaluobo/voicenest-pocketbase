// 为 users 集合添加 username 字段（带唯一索引）并将其加入 passwordAuth identityFields，
// 使用户可以通过用户名注册和登录。
migrate((app) => {
  const collection = app.findCollectionByNameOrId("users");
  if (!collection) return;

  // 检查是否已存在 username 字段
  let hasUsername = false;
  const fields = collection.fields;
  for (let i = 0; i < fields.length; i++) {
    if (fields[i].name === "username") {
      hasUsername = true;
      break;
    }
  }

  // 如果没有 username 字段，先添加
  if (!hasUsername) {
    const usernameField = new Field({
      name: "username",
      type: "text",
      required: true,
      system: false,
      presentable: true,
    });
    collection.fields.add(usernameField);
  }

  // 添加 username 唯一索引（identityField 要求 UNIQUE 约束）
  const indexes = collection.indexes || [];
  let hasIndex = false;
  for (let i = 0; i < indexes.length; i++) {
    if (indexes[i].indexOf("username") !== -1 && indexes[i].indexOf("UNIQUE") !== -1) {
      hasIndex = true;
      break;
    }
  }
  if (!hasIndex) {
    indexes.push("CREATE UNIQUE INDEX idx_users_username ON users (username) WHERE username != ''");
    collection.indexes = indexes;
  }

  // 将 username 加入 identityFields
  if (collection.passwordAuth) {
    collection.passwordAuth.identityFields = ["email", "username"];
  }

  app.save(collection);
  console.log("[VoiceNest] 已为 users 集合添加 username 字段 (UNIQUE) 并设为 identityField");
}, (app) => {
  const collection = app.findCollectionByNameOrId("users");
  if (!collection) return;
  if (collection.passwordAuth) {
    collection.passwordAuth.identityFields = ["email"];
  }
  app.save(collection);
});
