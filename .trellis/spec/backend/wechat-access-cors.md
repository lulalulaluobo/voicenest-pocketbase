# 公众号 Worker、Access、CORS 与默认封面契约

## 1. Scope / Trigger

当 Fork 用户部署 `workers/wechat-draft`，或 PWA 调用 Worker 的默认封面、预览、连通性测试和草稿接口时，Cloudflare Worker、KV、Secret、Access 与 CORS 必须使用同一位部署者的资源。模板不得包含原作者的域名、KV ID、公众号密钥、封面 `media_id` 或前端 Origin。

## 2. Signatures

```ts
interface Env {
  WECHAT_CACHE: KVStore
  WECHAT_APP_ID: string
  WECHAT_APP_SECRET: string
  ALLOWED_ORIGINS: string
}

GET  /cover                 // { configured: boolean }
POST /cover { dataUrl }     // { configured: true }
POST /connection-test
POST /preview
POST /drafts
```

部署模板的 `wrangler.jsonc` 必须启用 `workers_dev`，并只声明 `WECHAT_CACHE` binding；`WECHAT_APP_ID`、`WECHAT_APP_SECRET` 与 `ALLOWED_ORIGINS` 是必需的 Worker Secret。

## 3. Contracts

- 用户从 `workers/wechat-draft/.dev.vars.example` 复制出本地 `.dev.vars`，填写 AppID、AppSecret、`ACCESS_EMAIL` 和 `FRONTEND_PROVIDER`；此文件被 Git 忽略。
- 部署代理先得到前端生产 HTTPS Origin，再将其精确写入 `ALLOWED_ORIGINS` Secret。不得使用 `*`，也不得保留其他部署者的 Origin。
- 对尚不存在的 Worker，代理必须在首次 `wrangler deploy` 时通过进程标准输入提供 `WECHAT_APP_ID`、`WECHAT_APP_SECRET` 与 `ALLOWED_ORIGINS`；不得为 `--secrets-file` 持久化创建含密钥的临时、备份或仓库文件。
- `WECHAT_CACHE` 为用户自己的 KV namespace；其中 `wechat:default-cover-media-id` 保存用户已上传封面的永久素材 ID，绝不返回给前端。
- 设置页可显示内置封面或选择 PNG/JPEG/WebP（最大 5 MiB），但仅在用户显式点击上传时，Worker 才以 `material/add_material?type=image` 写入该用户的公众号永久素材库并更新 KV。
- 未配置默认封面时，`POST /drafts` 返回 `422 COVER_NOT_CONFIGURED`，不得创建或更新草稿。
- Worker 的地址为 `https://<worker-name>.<account-subdomain>.workers.dev`；Cloudflare Access 必须只允许 `ACCESS_EMAIL`。
- Access CORS 与 Worker 同时允许该 Origin、`GET`、`POST`、`OPTIONS`、`Content-Type` 和 credentials；`options_preflight_bypass` 保持关闭。
- 部署代理必须使用具备 `Access: Apps and Policies Write` 的当前授权会话，自行创建测试 Worker 的自托管 Access 应用和唯一 Allow 策略，并通过 API 读取回验；不得将 Access 资源配置交给用户。
- CORS 不是鉴权。Access 负责防止未授权用户调用持有公众号 Secret 的 Worker。

## 4. Validation & Error Matrix

| 条件 | 结果 |
| --- | --- |
| 缺少必需 Secret | Wrangler 部署校验失败；不得部署半配置的 Worker。 |
| Origin 不在 `ALLOWED_ORIGINS` | Worker 返回 403。 |
| 上传封面不是 PNG/JPEG/WebP、为空或超过 5 MiB | Worker 返回错误，且不调用微信公众号接口。 |
| 尚未上传默认封面即创建草稿 | Worker 返回 `422 COVER_NOT_CONFIGURED`，且不创建草稿。 |
| Access CORS 未包含前端 Origin | 浏览器在预检阶段拦截，实际请求不应到达 Worker。 |
| 实际 GET/POST 没有有效 Access 会话 | Access 拒绝请求。 |
| 微信返回 `40164` | Worker 返回 `WECHAT_IP_NOT_ALLOWED`；用户按 Cloudflare 官方 IPv4 列表配置公众号白名单后重试。 |
| Worker 配置含 `routes`、KV `id`、个人 Origin 或封面 `media_id` | 不能作为开源模板提交。 |

## 5. Good / Base / Bad Cases

- Good：用户填本地 `.dev.vars`，部署代理创建独立 KV、导入 Secret、写入最终 Pages/Vercel Origin 和测试 Access 策略，并在当前浏览器会话中完成 Access 回跳；用户只在公众号后台配置 API IP 白名单。
- Base：只部署前端，未启用公众号功能；前端仍可本地录音、处理和保存，不请求 Worker。
- Bad：将 AppSecret 或封面 `media_id` 放入 Vite 环境变量、README、`wrangler.jsonc`、Git 历史；或在设置页自动上传封面并意外消耗永久素材配额。

## 6. Tests Required

1. 静态检查 `wrangler.jsonc`：`workers_dev: true`，无 `routes`、KV `id` 和 `vars.ALLOWED_ORIGINS`，并仅声明三个必需 Secret。
2. `workers/wechat-draft/src/images.test.ts` 验证允许的封面 Data URL 与不允许的格式。
3. `workers/wechat-draft/src/index.test.ts` 验证 OPTIONS 包含 `GET`、封面状态不泄露 `media_id`、上传封面会保存 KV、无封面时草稿返回 422。
4. `npm --prefix workers/wechat-draft test`、`npm --prefix workers/wechat-draft run check`、`npm test` 与 `npm run build` 通过。
5. 部署后代理读取回验 Access 应用、唯一 Allow 策略与 CORS；未登录请求必须被 Access 重定向。代理在当前浏览器会话中完成 Access 登录后，运行“测试连接”、上传默认封面并验证预览；若收到 `WECHAT_IP_NOT_ALLOWED`，等待用户更新公众号 IP 白名单后再次验证。

## 7. Wrong vs Correct

### Wrong

```json
{
  "workers_dev": true,
  "vars": {
    "WECHAT_COVER_MEDIA_ID": "author-material-id",
    "ALLOWED_ORIGINS": "*"
  }
}
```

### Correct

```json
{
  "workers_dev": true,
  "kv_namespaces": [{ "binding": "WECHAT_CACHE" }],
  "secrets": {
    "required": ["WECHAT_APP_ID", "WECHAT_APP_SECRET", "ALLOWED_ORIGINS"]
  }
}
```

`ALLOWED_ORIGINS` 由部署代理在前端 Origin 确定后写入 Worker Secret；默认封面的 `media_id` 仅在用户上传后保存于该用户自己的 KV。
