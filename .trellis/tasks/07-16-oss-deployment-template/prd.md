# 开源部署模板

## Goal

将当前绑定个人 Cloudflare 域名、KV 和前端 Origin 的公众号 Worker 改为可 Fork 的部署模板，使开源用户仅需在未提交的本地私密配置文件中填写公众号资料，并由 AI 代理完成部署。

## What I already know

- 前端已经在设置页保存并使用用户填写的 Worker URL，无需在前端构建时注入 Worker 地址。
- 当前 `workers/wechat-draft/wrangler.jsonc` 写死了自定义域名路由、KV namespace ID 与生产 Origin。
- Worker 使用 `WECHAT_APP_ID`、`WECHAT_APP_SECRET`、`WECHAT_COVER_MEDIA_ID` 三个敏感绑定，并需要 `WECHAT_CACHE` KV 与 `ALLOWED_ORIGINS`。
- `.gitignore` 已忽略 `workers/wechat-draft/.dev.vars*`；README 目前只说明前端 Vercel 部署。

## Assumptions

- 默认采用 Cloudflare `workers.dev` 地址，不要求用户购买自定义域名。
- `.dev.vars` 仅保存在用户本机，包含公众号资料、Access 允许邮箱和前端部署平台偏好；AI 代理将其中的公众号资料上传为 Cloudflare Worker Secrets，绝不提交或打印密钥。
- Worker 继续通过 Cloudflare Access 保护；CORS 不作为鉴权替代。

## Requirements

- 提供可提交的 `workers/wechat-draft/.dev.vars.example`；用户复制为 `.dev.vars` 并填写 `WECHAT_APP_ID`、`WECHAT_APP_SECRET`、`WECHAT_COVER_MEDIA_ID`、`ACCESS_EMAIL` 与 `FRONTEND_PROVIDER`。
- 移除仓库中个人 Cloudflare 资源标识与个人域名。
- 更新 README，给出 AI 代理可执行的部署顺序、安全边界，以及可直接复制的提示词。
- AI 在部署完前端后取得实际 HTTPS Origin，再将其作为 Worker 的 `ALLOWED_ORIGINS` 配置；不要求用户预先填写。
- README 列出 Cloudflare 官方 IPv4 网段，供用户在微信公众号后台配置 API 调用 IP 白名单，并附官方列表链接以便部署时复核。

## Acceptance Criteria

- [ ] 仓库不再包含个人 Worker 路由、KV ID 或个人前端 Origin。
- [ ] 用户能从示例复制本地配置文件并填写部署所需的公众号数据。
- [ ] 文档明确 Secret、KV、CORS、Access 与微信公众号 IP 白名单的部署顺序。
- [ ] 文档中的微信公众号 IP 白名单与 Cloudflare 官方 IPv4 列表一致。
- [ ] Worker 类型检查与测试通过。

## Definition of Done

- 测试与类型检查通过。
- 文档说明准确且不包含真实密钥。
- `.gitignore` 继续排除私密配置。

## Out of Scope (explicit)

- 自动创建或支付第三方域名。
- 前端代管用户的模型 API Key 或公众号密钥。
- 为 Cloudflare / Vercel 写入用户的长期 API Token。
- 新增自动化部署脚本、GitHub Actions 或自定义域名支持。

## Technical Approach

### 方案 A：私密配置文件 + README AI 提示词（采用）

保留 Cloudflare 与 Vercel 的原生部署能力。Worker 配置不包含用户资源 ID 或自定义域名；用户提供本地 `.dev.vars`，AI 代理读取它并执行创建 KV、导入 Secret、部署、写入 Origin、配置 Access 的步骤。

优点：文件最少、没有新依赖或长期 Token，适合 AI 代理协助完成一次性个人部署。

### 方案 B：新增部署脚本

脚本读取同一配置文件并调用 Wrangler。

未采用：仍需要登录和 Access 的图形化/授权步骤，脚本不能实质减少用户准备工作，反而增加维护分支。

## Decision (ADR-lite)

**Context**：开源仓库不能携带原作者的 Cloudflare 资源、域名或公众号密钥，且目标用户希望让 AI 代理完成部署。

**Decision**：使用被 Git 忽略的 Worker `.dev.vars` 作为唯一的用户输入文件，并在 README 提供固定部署提示词；不提供自定义部署器。

**Consequences**：用户只需填写一份文件，但需要向 AI 代理完成 Cloudflare / Vercel 的交互式登录授权；前端最终 URL 由 AI 在部署后写入 Origin allowlist。

## Technical Notes

- 影响文件：`workers/wechat-draft/wrangler.jsonc`、`workers/wechat-draft/.dev.vars.example`、`README.md`。
- Cloudflare 的 Worker Secret 应使用 Wrangler Secret；KV 可在部署时创建并绑定；`workers.dev` 可用于无自定义域名的个人部署。
- 2026-07-16 已核对 Cloudflare 官方 IPv4 列表：`https://www.cloudflare.com/ips-v4`。

## Research References

- `references/cloudflare-templates/to-do-list-kv-template`：Cloudflare 官方 Worker + KV 模板，要求部署者创建自己的 KV namespace 并在本地更新绑定；本项目沿用“资源不随模板共享”的原则，不复用其完整应用结构。
