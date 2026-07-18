// v0.23+ 迁移签名：migrate((app) => {...}, (app) => {...})
//
// 历史用途：曾给 users 集合添加 asrConfig/llmConfig/syncConfig 等 8 个配置字段。
//
// 2026-07-18 重构后：所有用户配置（ASR/LLM/Obsidian/微信提示词等）改为只存本地 localStorage，
// 不再同步到 PocketBase users 集合。此迁移改为 no-op：
//   - 新部署：users 集合保持 PocketBase 默认结构（账号、邮箱、密码等），不加配置字段
//   - 已部署实例：迁移记录已存在于 _migrations 表，不会重跑，历史字段保留但不被前端使用
//     （如需清理，可在 PocketBase Admin 后台手动删除这些字段）
migrate((app) => {
  // no-op：不再添加配置字段
}, (app) => {
  // no-op
});
