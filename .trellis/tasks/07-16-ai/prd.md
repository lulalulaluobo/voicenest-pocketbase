# 更新 AI 测试部署指南

## Goal

让 `docs/cloudflare-pages-test-deployment.md` 明确要求 AI 代理自行完成 Cloudflare Pages 测试项目创建、构建配置和生产部署，不将该步骤交给用户手动完成。

## What I already know

- 当前指南的“从当前 GitHub 仓库创建”表述容易被解释为需要用户在 Dashboard 手动创建 Pages。
- Wrangler 已能从当前仓库的 `dist` 直接上传生产部署；项目可通过 Cloudflare API 写入构建命令与输出目录。

## Requirements

- 将 Pages 步骤改为代理创建 `-test` 项目、设置 `npm run build`/`dist`、本地构建并上传生产部署。
- 仅 Cloudflare Access 与微信公众号后台的交互式登录或确认需暂停并提示用户。

## Acceptance Criteria

- [x] 指南不再要求用户手动创建或连接 Pages 项目。
- [x] 指南保留项目名称、构建配置、固定生产 Origin 与安全检查。

## Out of Scope

- 不改变 Worker、KV、Access 或公众号验证步骤。
