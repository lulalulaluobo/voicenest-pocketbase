// admin_hooks.pb.js - PocketBase 管理后台安全防护与 API 扩展

// ==========================================
// 0. 安全防护：禁止删除初始管理员用户 & 禁止删除 users 集合
// ==========================================

// 禁止在 users 集合中删除 admin@example.com（初始管理员账号）
onRecordDeleteExecute((e) => {
  if (e.record.collection().name === "users") {
    const email = e.record.get("email");
    if (email === "admin@example.com") {
      throw new BadRequestError("禁止删除初始管理员账号 admin@example.com，请联系系统管理员。");
    }
  }
  e.next();
});

// 禁止删除 users 系统集合本身
onCollectionDeleteExecute((e) => {
  if (e.collection.name === "users") {
    throw new BadRequestError("禁止删除 users 系统集合，该集合为系统核心数据表。");
  }
  e.next();
});

// ==========================================
// 1. 超级管理员免旧密码直接重置 API
// ==========================================
routerAdd("POST", "/api/admin/reset-password", (c) => {
  const admin = c.get("admin");
  if (!admin) {
    return c.json(401, { code: "UNAUTHORIZED", message: "仅限已登录的超级管理员调用" });
  }

  try {
    const body = JSON.parse(c.request().body);
    const newPassword = body.newPassword || "";

    if (newPassword.trim().length < 10) {
      return c.json(400, { code: "INVALID_PASSWORD", message: "新密码长度必须至少为 10 位" });
    }

    admin.setPassword(newPassword.trim());
    c.app.saveAdmin(admin);

    return c.json(200, { success: true, message: "超级管理员密码重置成功" });
  } catch (err) {
    return c.json(500, { code: "INTERNAL_ERROR", message: "重置密码失败: " + err.message });
  }
});
