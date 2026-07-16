# 自动配置测试 Worker Access

## Goal

让测试部署指南要求 AI 代理优先通过 Cloudflare Access API 启用并配置测试 Worker 的 Access 与 CORS，而不是把该配置交给用户手动操作。

## What I already know

- Access API 能创建自托管应用、单邮箱 Allow 策略和应用级 CORS。
- 成功调用需要 `Access: Apps and Policies Write` 权限；缺失时才需要用户在 Dashboard 完成授权或配置。

## Requirements

- 指南写明代理先确认目标为 `-test`，再创建 Access 应用及唯一 Allow 策略。
- CORS 必须精确匹配 `PAGES_ORIGIN`、`GET/POST/OPTIONS`、`Content-Type`、credentials，且不绕过 OPTIONS。
- 写权限不足时，指南才暂停并说明需要的账户授权。

## Acceptance Criteria

- [x] 指南不再把测试 Access 配置默认交给用户手动完成。
- [x] 指南保留最小权限、精确 Origin 与验证要求。

## Out of Scope

- 不自动完成用户的 Access 身份登录或公众号 IP 白名单配置。
