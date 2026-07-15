# 公众号 Worker 与 Access CORS 契约

## 1. Scope / Trigger

当 PWA 或 Android WebView 调用 `https://wechat-api.lucc.fun` 的预览、连通性测试或草稿接口时，Cloudflare Access 和 Worker 必须共同完成 CORS。Access 保护实际请求；Worker 负责业务响应的 CORS 头。

## 2. Signatures

```ts
// Worker Env
ALLOWED_ORIGINS: string // 逗号分隔的精确 Origin

// Worker 行为
allowedOrigin(request: Request, env: Env): string | undefined
```

## 3. Contracts

- Worker `ALLOWED_ORIGINS` 固定包含 `https://obvoice.lucc.fun,https://localhost`，并只回显已匹配的请求 Origin。
- Access 应用“VoiceNest 微信公众号草稿服务”的 `cors_headers` 必须包含同样两个 Origin、`POST`、`OPTIONS`、`Content-Type`、`allow_credentials: true` 和 `max_age: 86400`。
- Access 应用保持管理员邮箱 Allow 策略和 `options_preflight_bypass: false`；OPTIONS 由 Access 响应，实际 POST 仍需要 Access Cookie。
- Android 的“重新授权”在同一 WebView 打开该域名并返回应用；不得改用外部浏览器，否则其 Cookie 不会被 Android WebView 的 `credentials: 'include'` 请求使用。
- 未匹配 Origin 的 Worker 请求返回 403；Access 预检也不得返回 `Access-Control-Allow-Origin`。

## 4. Validation & Error Matrix

| 条件 | 结果 |
| --- | --- |
| Android Origin 不在 Access CORS 设置中 | Access 返回预检响应但没有允许头，浏览器在到达 Worker 前拦截请求。 |
| Android Origin 不在 Worker allowlist | Worker 返回 403。 |
| OPTIONS 请求经过 Access | 浏览器不携带认证 Cookie；必须由 Access `cors_headers` 响应预检，不能依赖 Worker。 |
| 实际 POST 没有有效 Access Cookie | Access 拒绝请求；不得使用内置 Service Token 绕过。 |

## 5. Good / Base / Bad Cases

- Good：`OPTIONS` 携带 `Origin: https://localhost` 返回凭据、`POST`、`Content-Type` 与相同 Origin；登录后 POST 正常到达 Worker。
- Base：生产 PWA Origin 继续通过，不影响既有公众号编辑流程。
- Bad：使用 `*`、允许所有请求头/方法，或开启 `options_preflight_bypass` 后忘记在 Worker 限制 Origin。

## 6. Tests Required

1. `workers/wechat-draft/src/index.test.ts` 验证 Android OPTIONS 为 204 且回显 `https://localhost`。
2. 验证非 allowlist Origin 为 403。
3. `npm test --prefix workers/wechat-draft` 和 `npx tsc --noEmit --project workers/wechat-draft/tsconfig.json` 通过。
4. 部署后用 `curl -X OPTIONS` 验证 Access 对两个合法 Origin 输出许可头，对未知 Origin 不输出。

## 7. Wrong vs Correct

### Wrong

```ts
headers.set('Access-Control-Allow-Origin', '*')
```

### Correct

```ts
const origin = request.headers.get('Origin')
return origin && env.ALLOWED_ORIGINS.split(',').includes(origin) ? origin : undefined
```
