# 公众号 PocketBase 代理与凭据契约

## 1. Scope / Trigger

当设置页保存公众号凭据、测试连接、上传默认封面、预览或创建草稿时，前端必须调用同源 PocketBase 的 `/api/wechat/*` 接口。Cloudflare Worker、Pages、KV、Vercel 与 Access 授权流程已移除，不能作为部署依赖或重新授权入口。

## 2. Signatures

```text
POST /api/wechat/setup-credential  { appId, appSecret }
POST /api/wechat/connection-test
GET  /api/wechat/cover
POST /api/wechat/cover             { dataUrl }
POST /api/wechat/preview           { title, markdown }
POST /api/wechat/drafts            { recordingId, requestId, title, markdown, draftMediaId? }
```

所有接口都要求 `Authorization: Bearer <PocketBase token>`。后端运行期必须提供 32 字节 `VN_ENCRYPTION_KEY`；公众号凭据存储在 `wechat_accounts`，默认封面素材 ID 存储在 `wechat_kv`，都不得返回给客户端。

## 3. Contracts

- `src/lib/wechat.ts` 的请求基地址是 `pb.baseUrl + '/api/wechat'`；不得恢复任何 Worker URL、`return_to` 参数或浏览器跳转。
- 设置页只接受 AppID 与 AppSecret。保存成功后 AppSecret 从内存输入框清除，前端仅保留 AppID 与 `configured` 状态。
- `VN_ENCRYPTION_KEY` 仅存在部署机 `.env` 与容器运行环境，长度必须为 32；绝不可写入 APK、前端环境变量、README 示例值或 Git。
- 公号 API IP 白名单填写 PocketBase 服务器的出站公网 IP，不是客户端 IP，也不是反向代理的域名。
- 若 PocketBase 在另一台 VPS 上，`PB_BIND_ADDRESS=0.0.0.0` 仅配合 Docker 防火墙白名单使用；反向代理 VPS 是唯一允许访问 TCP 8090 的来源。

## 4. Validation & Error Matrix

| 条件 | 结果 |
| --- | --- |
| 未登录、缺少或失效 Bearer Token | 返回 401/403；前端显示“公众号配置或授权已过期，请检查设置”。 |
| `VN_ENCRYPTION_KEY` 缺失或长度不是 32 | Hook 拒绝加解密，服务不应静默保存凭据。 |
| 微信返回 IP 白名单错误 | 返回 `WECHAT_IP_NOT_ALLOWED`；提示用户把 PocketBase 出站 IP 加入公众号后台。 |
| 未上传默认封面就创建草稿 | 返回 `422 COVER_NOT_CONFIGURED`，不创建草稿。 |
| `dataUrl` 不是 PNG/JPEG/WebP、为空或超过 5 MiB | 返回错误，且不调用微信素材接口。 |
| 旧备份包含过期 AppID/状态 | 可恢复本地显示状态，但用户必须在设置页重新保存 AppID/AppSecret；不得跳转 Worker 授权页。 |

## 5. Good / Base / Bad Cases

- Good：用户登录后填写 AppID/AppSecret，点击保存、测试连接、上传封面，再创建草稿；所有请求均命中同源 PocketBase。
- Base：未配置公众号时，录音、转写、整理和 Obsidian 同步仍可正常使用。
- Bad：通过 `window.open` 打开历史 Worker 授权页，或把 AppSecret、默认封面 `media_id`、`VN_ENCRYPTION_KEY` 放到前端配置中。

## 6. Tests Required

1. `src/lib/wechat.test.ts` 断言每个请求使用 `${pb.baseUrl}/api/wechat/*` 和 Bearer Token。
2. PocketBase Hook 测试覆盖：未认证、无封面、IP 白名单错误与 AppSecret 加密/解密失败。
3. `npm test`、`npm run build`、`npx cap sync android` 与 Android Gradle 构建通过。
4. 真机验证：设置页“公众号草稿箱”展开 AppID/AppSecret 表单，不打开浏览器或 Worker 授权页。

## 7. Wrong vs Correct

### Wrong

```ts
window.open('https://old-worker.example.com/authorize')
```

### Correct

```ts
await fetch(`${pb.baseUrl}/api/wechat/setup-credential`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pb.authStore.token}` },
  body: JSON.stringify({ appId, appSecret }),
})
```
