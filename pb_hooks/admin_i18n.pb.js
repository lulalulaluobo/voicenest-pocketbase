// admin_hooks.pb.js - PocketBase 管理后台安全防护

// ==========================================
// 0. 安全防护：禁止删除 users 集合
// ==========================================

// 禁止删除 users 系统集合本身
onCollectionDeleteExecute((e) => {
  if (e.collection.name === "users") {
    throw new BadRequestError("禁止删除 users 系统集合，该集合为系统核心数据表。");
  }
  e.next();
});
