# 开源部署模板实施计划

**目标：** Fork 用户填写本地私密文件后，可由 AI 代理部署独立的前端和公众号 Worker。

**架构：** Wrangler 仅声明可共享的 Worker、KV binding 和必需 Secret 名。用户资源在部署时创建；`.dev.vars` 是唯一的人工输入。

## 约束

- 不新增依赖、部署脚本、GitHub Actions 或长期 API Token。
- 不提交密钥、Cloudflare 资源 ID、个人域名或 `.dev.vars`。
- `ALLOWED_ORIGINS` 仅含最终前端 HTTPS Origin；Access 是鉴权边界。

### Task 1：去除 Worker 的个人部署绑定

**文件：**

- Create: `workers/wechat-draft/.dev.vars.example`
- Modify: `workers/wechat-draft/wrangler.jsonc`

- [x] **Step 1：验证当前配置不能作为模板。**

```bash
node - <<'NODE'
const { readFileSync } = require('node:fs')
const config = JSON.parse(readFileSync('workers/wechat-draft/wrangler.jsonc', 'utf8'))
if (config.workers_dev !== true) throw new Error('workers.dev must be enabled')
if (config.routes || config.kv_namespaces?.[0]?.id || config.vars?.ALLOWED_ORIGINS) throw new Error('personal values remain')
NODE
```

预期：失败；当前文件包含个人路由、KV ID 和 Origin。

- [x] **Step 2：最小化 `wrangler.jsonc`。**

```json
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "voicenest-wechat-draft",
  "main": "src/index.ts",
  "compatibility_date": "2026-07-15",
  "workers_dev": true,
  "kv_namespaces": [{ "binding": "WECHAT_CACHE" }],
  "secrets": {
    "required": [
      "WECHAT_APP_ID",
      "WECHAT_APP_SECRET",
      "WECHAT_COVER_MEDIA_ID",
      "ALLOWED_ORIGINS"
    ]
  }
}
```

不保留 `routes`、KV `id` 或 `vars`。部署代理在前端 URL 产生后写入 `ALLOWED_ORIGINS` Secret。

- [x] **Step 3：创建唯一用户输入模板。**

```dotenv
WECHAT_APP_ID=
WECHAT_APP_SECRET=
WECHAT_COVER_MEDIA_ID=
ACCESS_EMAIL=
FRONTEND_PROVIDER=vercel
```

写入 `workers/wechat-draft/.dev.vars.example`；不加入 `ALLOWED_ORIGINS`，因为该值只能在前端生产部署后确定。

- [x] **Step 4：验证模板与 Worker。**

运行配置断言（检查 `workers_dev`、无 `routes` / KV ID / `vars`，以及四个必需 Secret），然后运行：

```bash
npm --prefix workers/wechat-draft test
npm --prefix workers/wechat-draft run check
```

预期：检查、Worker 测试与类型检查均成功。

### Task 2：提供面向 AI 代理的部署文档

**文件：**

- Modify: `README.md`

- [x] **Step 1：扩展部署章节。**

说明前端可选 Vercel 或 Cloudflare Pages 的免费平台子域名；Worker 使用 `workers.dev`。说明复制 `.dev.vars.example` 为 `.dev.vars` 后填写公众号三项、Access 邮箱与平台偏好，且该文件绝不提交。

- [x] **Step 2：写入部署顺序。**

要求 AI：部署前端并得到 Origin；创建/绑定 KV；导入三项 `WECHAT_*` Secret；写入 `ALLOWED_ORIGINS` Secret；部署 Worker；为 `workers.dev` 启用仅允许 `ACCESS_EMAIL` 的 Access，并让 Access CORS 与 Worker 的 Origin、`POST`、`OPTIONS`、`Content-Type` 和 credentials 配置一致；在应用内测试连接。

- [x] **Step 3：写入 IP 白名单和 AI 提示词。**

列出已确认的 15 条 Cloudflare IPv4 CIDR，并链接 `https://www.cloudflare.com/ips-v4` 要求部署时复核。提示词要求 AI 不输出或提交 `.dev.vars`，完成前端、KV、Secret、Access 与 CORS 配置后报告两个 URL 和连接测试结果。

- [x] **Step 4：完成验证。**

运行以下命令：

```bash
rg -n 'lucc\.fun|185d1e57b556475a8efebb3f29829938|obvoice\.lucc\.fun' README.md workers/wechat-draft/wrangler.jsonc
npm test
npm run build
npm --prefix workers/wechat-draft test
npm --prefix workers/wechat-draft run check
```

预期：`rg` 无输出，其他命令成功，并额外运行 `git diff --check`。
