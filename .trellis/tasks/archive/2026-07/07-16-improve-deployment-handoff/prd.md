# 完善部署交付报告与上线指引

## Goal

让 AI 代理在完成 VoiceNest 部署后，以固定报告交付可直接上线的信息：地址、Access 状态、网页/APK 设置方式、Access 邮箱的用途与剩余人工步骤。

## What I already know

- README 的通用部署提示词只要求简略报告 URL 和连接结果。
- `docs/cloudflare-pages-test-deployment.md` 已有最终报告，但未说明用户如何在网页或 APK 中填写 Worker 地址，也没有解释 `ACCESS_EMAIL` 的使用时机。
- Android WebView Origin 为 `https://localhost`；网页 Origin 是最终 Pages URL；二者同时使用时 Worker `ALLOWED_ORIGINS` 与 Access CORS 必须包含两者。

## Requirements

- 为测试部署指南增加固定“部署交付报告”模板。
- 报告必须说明 Pages URL、Worker URL、KV、Access 状态、网页与 APK 的设置步骤。
- 明确 `ACCESS_EMAIL` 仅用于创建 Access Allow 策略，用户在“重新授权”时使用该邮箱完成登录；不得输出该邮箱值。
- 列出上线前必须由用户完成的微信公众号 IP 白名单及应用设置步骤。
- 同步更新 README 的通用 AI 部署提示词，使其要求相同的信息类别。

## Acceptance Criteria

- [x] 两份文档都要求部署结束后交付结构化报告。
- [x] 报告同时覆盖网页、仅 APK、双端三种使用方式。
- [x] 文档解释 Access 邮箱用途且不暴露实际值。
- [x] 文档继续禁止输出 Secret、Token、Cookie、媒体 ID 或邮箱。

## Out of Scope

- 不改变 Worker、Access、APK 或 Pages 的运行时配置。
