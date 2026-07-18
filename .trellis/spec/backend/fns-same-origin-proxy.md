# FNS 同源代理契约

## 1. Scope / Trigger

当网页 PWA 或 Capacitor App 测试或写入 Fast Note Sync（FNS）时，前端不得直接向用户填写的 FNS 域名发起浏览器请求。所有 FNS HTTP 请求必须先发送到同源、已登录的 PocketBase，再由 `pb_hooks/fns.pb.js` 转发。这样不要求用户修改 FNS 的反向代理 CORS 配置，也不改变 Obsidian FNS 插件的请求方式。

## 2. Signatures

```text
POST /api/fns/connection-test  { api, apiToken }
POST /api/fns/note             { api, apiToken, vault, path, content, createOnly }
```

两个接口均要求 `Authorization: Bearer <PocketBase token>`。PocketBase 到 FNS 的固定上游接口为：

```text
GET  <api>/api/user/info
POST <api>/api/note
```

## 3. Contracts

- `src/lib/sync.ts` 只调用 `${pb.baseUrl}/api/fns/*`；不可恢复浏览器直连 `${api}/api/*`。
- `api` 必须是无路径、无查询参数的公共 HTTPS 域名（可带端口），不接受 IP、`localhost`、`.local` 或 `.internal` 地址，避免代理被用作内网探测器。
- `apiToken` 仅存在设置页本地数据和本次 HTTPS 请求体中；Hook 不写数据库、不写日志、不在响应中回显。
- 转发请求使用 FNS 官方 Obsidian 插件的 `X-Client: ObsidianPlugin` 标识，因而既有受该客户端范围限制的 FNS Token 可直接使用。
- 接口仅允许认证用户调用，并按用户和路由限流：连接测试 20 次/分钟、写笔记 60 次/分钟。
- FNS 必须为手机可访问的 HTTPS 服务；PWA 和 App 不再要求 FNS 为 VoiceNest Origin 配置 CORS。FNS 的 CORS/反向代理配置应保持 Obsidian 插件可用的原有状态。

## 4. Validation & Error Matrix

| 条件 | 结果 |
| --- | --- |
| PocketBase 未登录或 Token 失效 | 同源接口返回 401/403，前端提示检查登录状态。 |
| FNS 地址为 HTTP、包含路径、指向 IP/内网 | 返回 400 `FNS_CONNECTION_FAILED` 或 `FNS_NOTE_FAILED`，且不发起上游请求。 |
| FNS Token 为空、过长或被 FNS 拒绝 | 返回 FNS 原始鉴权结果；前端显示 FNS 返回的原因。 |
| FNS 返回非 JSON | 返回 400，提示“FNS 返回了无效响应”。 |
| 笔记路径/库名无效，或内容超过 512 KiB | 返回 400，且不写入 FNS。 |
| 单用户超过限流 | 返回现有统一限流响应，不访问 FNS。 |

## 5. Good / Base / Bad Cases

- Good：iPhone PWA 登录 VoiceNest 后，填写与 Obsidian 插件相同的 FNS JSON，连接测试和写入笔记都经同源 PocketBase 成功，不需要 Nginx CORS 规则。
- Good：FNS 反向代理不添加 `Access-Control-Allow-*` 规则时，Obsidian 插件仍可连接，VoiceNest 也可通过代理同步。
- Base：FNS 上游临时不可用时，前端显示 FNS 的失败信息，不泄露 Token。
- Bad：在前端用 `fetch(config.api + '/api/note')` 绕过 PocketBase，或把任意 URL/内网 IP 转交给 `$http.send`。

## 6. Tests Required

1. `src/lib/sync.test.ts` 断言连接测试调用同源 `/api/fns/connection-test`，不直接调用 FNS 域名。
2. `src/lib/api-clients.test.ts` 断言笔记同步调用同源 `/api/fns/note`。
3. 容器启动后，未认证调用返回 401；`https://localhost` 被拒绝且不访问上游。
4. `npm test` 与 `npm run build` 通过；PWA 和 Android 各用同一份 FNS JSON 完成一次连接测试和笔记写入。

## 7. Wrong vs Correct

### Wrong

```ts
await fetch(`${config.api}/api/note`, {
  headers: { token: config.apiToken },
})
```

### Correct

```ts
await fetch(`${pb.baseUrl}/api/fns/note`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pb.authStore.token}` },
  body: JSON.stringify({ api: config.api, apiToken: config.apiToken, vault, path, content }),
})
```
