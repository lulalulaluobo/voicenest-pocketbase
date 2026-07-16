# VoiceNest

个人使用的本地优先语音收件箱。录音、模型 API Key 与公众号配置均保存在用户自己的设备或 Cloudflare 账号中。

## 本地运行

```bash
npm install
npm run dev
npm run test
npm run build
```

## 部署

VoiceNest 可拆分为两部分部署：静态前端与微信公众号 Worker。前端可部署到 Vercel 或 Cloudflare Pages；二者提供免费平台子域名（`.vercel.app` / `.pages.dev`），不是免费自定义域名。Worker 使用 Cloudflare 提供的 `workers.dev` 地址，不需要购买域名。

### 部署前准备

1. Fork 本仓库，并准备 Cloudflare 账号、Vercel 或 Cloudflare Pages 账号。
2. 在微信公众号后台准备 AppID、AppSecret，以及素材库中默认封面的永久 `media_id`。
3. 准备用于 Cloudflare Access 的管理员邮箱。
4. 复制本地私密配置文件，填写自己的信息：

   ```bash
   cp workers/wechat-draft/.dev.vars.example workers/wechat-draft/.dev.vars
   ```

   `.dev.vars` 已被 Git 忽略。不要提交、截图、贴入公开 Issue，或把它的内容写入前端环境变量。

### 交给 AI 代理部署

将下面提示词连同本地仓库交给可访问终端和浏览器的 AI 代理。登录 Cloudflare / Vercel 时请在官方页面自行完成授权，不要把账户密码或长期 API Token 写入 `.dev.vars`。

```text
请部署当前 VoiceNest Fork。读取 workers/wechat-draft/.dev.vars，但绝不打印、提交、复制到前端或写入日志其中的值。

1. 根据 FRONTEND_PROVIDER 将前端部署到 Vercel 或 Cloudflare Pages，记录最终生产 HTTPS Origin。
2. 登录我的 Cloudflare 账号。在 workers/wechat-draft 部署 Worker，创建并绑定我自己的 WECHAT_CACHE KV；若 Wrangler 把新 KV ID 写回本地 wrangler.jsonc，保留该本地变更但不要提交。
3. 将 WECHAT_APP_ID、WECHAT_APP_SECRET、WECHAT_COVER_MEDIA_ID 写为 Cloudflare Worker Secrets。
4. 将第 1 步的准确 Origin 写为 ALLOWED_ORIGINS Worker Secret；不要使用 *，不要添加旧域名。
5. 部署 Worker，记录其 https://<worker-name>.<account-subdomain>.workers.dev URL。
6. 在 Cloudflare Access 为该 workers.dev Worker 启用鉴权，只允许 ACCESS_EMAIL。配置 Access CORS：允许同一个前端 Origin、POST 和 OPTIONS、Content-Type 请求头、credentials，并保持 options preflight 不绕过 Access。
7. 在 VoiceNest 设置页填入 Worker URL，完成 Access 登录后运行“测试连接”。
8. 最后只报告前端 URL、Worker URL、连接测试结果，以及是否还需配置公众号 IP 白名单；不要报告任何 Secret。
```

`ALLOWED_ORIGINS` 只在得到最终前端 URL 后设置。Cloudflare Access 才是 Worker 的鉴权边界；CORS 只限制浏览器来源，不能替代鉴权。

### 微信公众号 IP 白名单

在公众号后台的 API 调用 IP 白名单中加入以下 Cloudflare IPv4 网段，然后重新运行“测试连接”。这些网段可能调整，部署时请以 [Cloudflare 官方 IPv4 列表](https://www.cloudflare.com/ips-v4) 为准。

```text
173.245.48.0/20
103.21.244.0/22
103.22.200.0/22
103.31.4.0/22
141.101.64.0/18
108.162.192.0/18
190.93.240.0/20
188.114.96.0/20
197.234.240.0/22
198.41.128.0/17
162.158.0.0/15
104.16.0.0/13
104.24.0.0/14
172.64.0.0/13
131.0.72.0/22
```

手机测试必须通过部署后的 HTTPS 地址访问。录音与 IndexedDB 数据始终保存在该手机本地；模型 API Key 也仅保存在该设备的浏览器存储中。
