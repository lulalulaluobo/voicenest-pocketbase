# 公众号 Worker、Access 与 CORS 契约

## 1. Scope / Trigger

当 Fork 用户部署 `workers/wechat-draft`，或 PWA 调用 Worker 的预览、连通性测试和草稿接口时，Cloudflare Worker、KV、Secret、Access 与 CORS 必须使用同一位部署者的资源。模板不得包含原作者的域名、KV ID、公众号密钥或前端 Origin。

## 2. Signatures

```ts
interface Env {
  WECHAT_CACHE: KVStore
  WECHAT_APP_ID: string
  WECHAT_APP_SECRET: string
  WECHAT_COVER_MEDIA_ID: string
  ALLOWED_ORIGINS: string
}

function allowedOrigin(request: Request, env: Env): string | undefined
```

部署模板的 `wrangler.jsonc` 必须启用 `workers_dev`，并只声明 `WECHAT_CACHE` binding；`WECHAT_APP_ID`、`WECHAT_APP_SECRET`、`WECHAT_COVER_MEDIA_ID` 与 `ALLOWED_ORIGINS` 都是必需的 Worker Secret。

## 3. Contracts

- 用户从 `workers/wechat-draft/.dev.vars.example` 复制出本地 `.dev.vars`，填写三个 `WECHAT_*` 值、`ACCESS_EMAIL` 和 `FRONTEND_PROVIDER`；此文件被 Git 忽略。
- 部署代理先得到前端生产 HTTPS Origin，再将其精确写入 `ALLOWED_ORIGINS` Secret。不得使用 `*`，也不得保留其他部署者的 Origin。
- `WECHAT_CACHE` 为用户自己的 KV namespace；Wrangler 自动创建或写回的 KV ID 只保留在本地，绝不提交。
- Worker 的地址为 `https://<worker-name>.<account-subdomain>.workers.dev`；Cloudflare Access 必须只允许 `ACCESS_EMAIL`。
- Access CORS 与 Worker 同时允许该 Origin、`POST`、`OPTIONS`、`Content-Type` 和 credentials；`options_preflight_bypass` 保持关闭。
- CORS 不是鉴权。Access 负责防止未授权用户调用持有公众号 Secret 的 Worker。

## 4. Validation & Error Matrix

| 条件 | 结果 |
| --- | --- |
| 缺少必需 Secret | Wrangler 部署校验失败；不得部署半配置的 Worker。 |
| Origin 不在 `ALLOWED_ORIGINS` | Worker 返回 403。 |
| Access CORS 未包含前端 Origin | 浏览器在预检阶段拦截，实际请求不应到达 Worker。 |
| 实际 POST 没有有效 Access 会话 | Access 拒绝请求。 |
| 微信返回 `40164` | Worker 返回 `WECHAT_IP_NOT_ALLOWED`；用户按 Cloudflare 官方 IPv4 列表配置公众号白名单后重试。 |
| Worker 配置含 `routes`、KV `id` 或个人 Origin | 不能作为开源模板提交。 |

## 5. Good / Base / Bad Cases

- Good：用户填本地 `.dev.vars`，部署代理创建独立 KV、导入 Secret、写入最终 Pages/Vercel Origin，并在已登录 Access 的 PWA 中发布草稿。
- Base：只部署前端，未启用公众号功能；前端仍可本地录音、处理和保存，不请求 Worker。
- Bad：将 AppSecret 放入 Vite 环境变量、README、`wrangler.jsonc` 或 Git 历史；或将 CORS 设为 `*` 并认为 Worker 已受保护。

## 6. Tests Required

1. 静态检查 `wrangler.jsonc`：`workers_dev: true`，无 `routes`、KV `id` 和 `vars.ALLOWED_ORIGINS`，并声明四个必需 Secret。
2. `workers/wechat-draft/src/index.test.ts` 继续验证合法 Origin 的 OPTIONS 为 204、未知 Origin 为 403，以及授权回跳只返回允许的设置页。
3. `npm --prefix workers/wechat-draft test` 和 `npm --prefix workers/wechat-draft run check` 通过。
4. 部署后在浏览器中完成 Access 登录，运行“测试连接”；若收到 `WECHAT_IP_NOT_ALLOWED`，更新公众号 IP 白名单后再次验证。

## 7. Wrong vs Correct

### Wrong

```json
{
  "workers_dev": false,
  "routes": [{ "pattern": "personal.example.com", "custom_domain": true }],
  "vars": { "ALLOWED_ORIGINS": "https://personal.example.com" }
}
```

### Correct

```json
{
  "workers_dev": true,
  "kv_namespaces": [{ "binding": "WECHAT_CACHE" }],
  "secrets": {
    "required": ["WECHAT_APP_ID", "WECHAT_APP_SECRET", "WECHAT_COVER_MEDIA_ID", "ALLOWED_ORIGINS"]
  }
}
```

`ALLOWED_ORIGINS` 由部署代理在前端 Origin 确定后写入 Worker Secret；Worker 仅回显精确匹配的 Origin。
