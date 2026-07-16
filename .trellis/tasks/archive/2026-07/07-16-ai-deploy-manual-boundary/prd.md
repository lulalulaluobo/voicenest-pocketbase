# 收紧 AI 部署指南人工步骤

## Goal

将测试部署指南明确为：代理负责 Cloudflare 与前端的全部部署、Access 登录回跳和验证；用户唯一需要在业务后台完成的步骤是微信公众号 API IP 白名单。

## Requirements

- 删除要求用户手动创建 Pages、Worker、KV、Secret、Access、CORS 或登录回跳的表述。
- 保留禁止索取、保存或输出密码、Cookie、Secret 和长期 Token 的边界。
- 将微信公众号 IP 白名单标记为唯一需要用户在公众号后台完成的步骤；代理收到确认后继续重试验证。

## Acceptance Criteria

- [x] 指南清楚列出唯一人工业务步骤为公众号 IP 白名单。
- [x] Cloudflare 登录授权只作为代理使用现有浏览器会话的交互，不成为用户配置任务。

## Out of Scope

- 不改动实际部署资源或 Worker 代码。
