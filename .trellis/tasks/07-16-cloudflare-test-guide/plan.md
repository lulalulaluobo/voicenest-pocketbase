# Cloudflare 全链路测试指南实施计划

**目标：** 将安全、可重复的 Cloudflare Pages + 独立 Worker 测试流程固化为单一项目指南。

### Task 1：新增指南并链接 README

**文件：**

- Create: `docs/cloudflare-pages-test-deployment.md`
- Modify: `README.md`

- [x] 编写中文指南：定义测试资源命名、`.dev.vars` 不泄露规则、Pages 部署、独立 KV / Worker / Secret、Access CORS、公众号白名单、前端验收和最终报告限制。
- [x] 在 README 的部署章节加入该指南链接，不复制测试流程。
- [x] 检查指南不含真实密钥、个人域名或账号，并执行 `git diff --check`。
