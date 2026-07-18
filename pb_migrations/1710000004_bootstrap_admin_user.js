migrate((app) => {
  try {
    const collection = app.findCollectionByNameOrId("users");
    if (!collection) return;
    
    try {
      app.findFirstRecordByData("users", "email", "admin@example.com");
    } catch (_) {
      // 没找到，说明需要首次创建
      const record = new Record(collection);
      record.set("email", "admin@example.com");
      record.set("emailVisibility", true);
      record.setPassword("admin123456");
      app.save(record);
      console.log("[VoiceNest] 已通过数据库迁移成功在 users 集合中初始化默认普通用户：admin@example.com，密码：admin123456");
    }
  } catch (err) {
    console.log("[VoiceNest] 初始化 users 默认用户迁移发生异常: " + err.message);
  }
}, (app) => {
  // down migration (no-op)
});
