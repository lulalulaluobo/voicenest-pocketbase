# Cloudflare 全链路测试指南

## Goal

将 Cloudflare Pages 与独立测试 Worker 的全链路测试流程固化为仓库内指南，使 AI 代理只需阅读该文件即可安全执行，并让 README 保持通用部署入口。

## What I already know

- README 已包含面向开源用户的通用部署提示词、Worker Secret、Access、CORS 与公众号 IP 白名单说明。
- 用户提供了独立测试部署的完整约束：仅 Cloudflare Pages、独立测试 Worker、禁止覆盖生产资源、禁止泄露 `.dev.vars` 内容、仅创建公众号测试草稿。
- 现有文档目录主要保存设计和计划；本任务新增一个面向实际部署的操作指南。

## Requirements

- 新增 `docs/cloudflare-pages-test-deployment.md`，作为唯一的 Cloudflare 全链路测试操作指南。
- 指南要求测试 Worker 使用独立名称，不得覆盖生产 Worker、Pages、KV、域名或草稿。
- 指南定义 `.dev.vars` 的读取边界、Secret、KV、Origin、Access CORS、公众号白名单和前端验收步骤。
- README 仅链接该指南，不复制整段测试流程。
- 指南的所有内容使用中文，且不含任何真实 Secret 或账户信息。

## Acceptance Criteria

- [ ] AI 可通过“阅读 `docs/cloudflare-pages-test-deployment.md` 并执行”获得完整测试步骤。
- [ ] 文档明确要求使用 Cloudflare Pages 而非 Vercel，并使用独立测试 Worker。
- [ ] 文档包含安全限制、人工登录暂停点、成功与 IP 白名单待配置两种结果。
- [ ] README 可定位到该指南，且无重复的大段测试提示词。

## Out of Scope

- 自动部署脚本、GitHub Actions 或自动操作微信公众号后台。
- 修改 Worker 业务逻辑或前端功能。

## Technical Notes

- 影响文件：`docs/cloudflare-pages-test-deployment.md`、`README.md`。
- 现有 Worker 的 `ALLOWED_ORIGINS` 支持以逗号分隔的精确 Origin；Android WebView 需要额外加入 `https://localhost`。
