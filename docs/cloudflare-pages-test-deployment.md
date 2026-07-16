# Cloudflare Pages + Worker 全链路测试指南

> 交给 AI 代理时只需说：**“请阅读 `docs/cloudflare-pages-test-deployment.md`，并严格按其中步骤执行。”**

本指南用于一次不影响现有生产服务的全链路测试：Cloudflare Pages、独立 Worker、KV、Secret、Cloudflare Access、CORS 与微信公众号草稿箱。测试只允许创建草稿，绝不群发文章。

## 0. 安全边界

- 只使用 Cloudflare Pages；本次测试不使用 Vercel。
- 测试 Worker、Pages 项目和 KV 名称必须与生产资源不同。推荐 Worker 名称：`voicenest-wechat-draft-test`；推荐 Pages 项目名：`voicenest-test`。
- 可以读取 `workers/wechat-draft/.dev.vars`，但不得打印、复制到聊天、写入日志、提交 Git、写入前端环境变量或备份文件。
- 不索取、不保存账户密码或长期 API Token。涉及 Cloudflare、GitHub、Access、微信公众号后台登录时，暂停并由用户在官方页面完成。
- 不修改、删除或覆盖现有生产 Worker、Pages、KV、域名或公众号草稿。
- 每次可能影响资源的操作前，核对名称含 `-test`；不符合则停止并说明。

## 1. 检查本地配置

阅读：

- `README.md`
- `workers/wechat-draft/wrangler.jsonc`
- `workers/wechat-draft/.dev.vars`

确认 `.dev.vars` 中以下值非空，但不要显示其值：

- `WECHAT_APP_ID`
- `WECHAT_APP_SECRET`
- `ACCESS_EMAIL`

将 `FRONTEND_PROVIDER` 设为 `cloudflare-pages`。如果该文件不存在，先从 `workers/wechat-draft/.dev.vars.example` 复制生成；真实 `.dev.vars` 不得提交。

## 2. 部署 Cloudflare Pages

此步骤由 AI 代理自行完成；不得要求用户在 Cloudflare Dashboard 手动创建 Pages 项目或连接 GitHub。

1. 从当前 GitHub 仓库已检出的工作区构建前端。创建新的 Cloudflare Pages **生产**项目，名称使用独立测试名，例如 `voicenest-test`；创建前确认该项目不存在，且名称含 `-test`。
2. 将项目构建配置写为构建命令 `npm run build`、输出目录 `dist`、生产分支 `main`。
3. 在本地运行 `npm run build`，然后将 `dist` 以生产分支上传到该测试 Pages 项目。代理必须使用 Pages 的固定项目域名，不得把上传返回的随机部署 URL 当作 Origin。
4. 验证固定生产地址可访问，记录：

   ```text
   https://<pages-project>.pages.dev
   ```

5. 将该地址记为 `PAGES_ORIGIN`。不要使用 PR 预览部署的随机 URL。

## 3. 部署独立测试 Worker 与 KV

1. 在本地将 `workers/wechat-draft/wrangler.jsonc` 的 `name` 临时改为唯一测试名称，例如 `voicenest-wechat-draft-test`。不得使用生产名称。
2. 创建名为 `voicenest-wechat-cache-test` 的独立 `WECHAT_CACHE` KV namespace，并仅在本地 `wrangler.jsonc` 绑定其 ID。不得使用或改动生产 KV。
3. 在部署前执行 Worker 干跑校验，确认部署目标与 KV 均为 `-test` 资源。
4. 按第 4 节以 Secret 一并完成首次部署，再记录 Worker 地址：

   ```text
   https://voicenest-wechat-draft-test.<cloudflare-subdomain>.workers.dev
   ```

5. 如果 Wrangler 把新 KV ID 写回本地 `wrangler.jsonc`，保留它仅用于本次测试；不要提交。测试结束后向用户报告这项本地变更。

## 4. 配置 Worker Secret 与 Origin

将以下 `.dev.vars` 值作为测试 Worker Secret 写入：

- `WECHAT_APP_ID`
- `WECHAT_APP_SECRET`

再写入：

```text
ALLOWED_ORIGINS=<PAGES_ORIGIN>
```

不得使用 `*`。如果用户明确要求同时测试 Android App，改为：

```text
ALLOWED_ORIGINS=<PAGES_ORIGIN>,https://localhost
```

对于尚不存在的测试 Worker，Wrangler 不能先执行 `secret put`。代理必须从 `.dev.vars` 读取两项值，并与 `ALLOWED_ORIGINS` 在进程标准输入中合成为 `--secrets-file /dev/stdin` 的首次部署输入；不得将 Secret 写入仓库、前端、日志、临时文件或备份文件。首次部署成功后，使用 `secret list` 仅核对三个 Secret 名称是否存在。

确认测试 Worker 存在三项必需 Secret 后，再执行最终部署或验证。不得显示 Secret、AppID 或 AppSecret。

## 5. 配置 Cloudflare Access 与 CORS

为测试 Worker 的 `workers.dev` 地址启用 Cloudflare Access：

- 仅允许 `ACCESS_EMAIL`。
- Access CORS 的 Allowed origins 设置为 `PAGES_ORIGIN`；Android 测试时额外加入 `https://localhost`。
- 允许方法：`GET`、`POST`、`OPTIONS`。
- 允许请求头：`Content-Type`。
- 启用 credentials。
- 不绕过 OPTIONS 预检。

Worker 的 `ALLOWED_ORIGINS` 与 Access CORS 必须一致。CORS 不是鉴权；Access 才负责限制公众号 Secret 的使用者。

若需要在 Cloudflare 页面创建或确认 Access 配置，暂停并明确告诉用户需要完成的页面操作。

## 6. 微信公众号 API 调用 IP 白名单

提示用户在微信公众号后台加入以下 IPv4 CIDR，再重新运行连接测试：

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

部署时以 [Cloudflare 官方 IPv4 列表](https://www.cloudflare.com/ips-v4) 复核。如果“测试连接”先返回 `40164` 或 `WECHAT_IP_NOT_ALLOWED`，这是白名单待配置状态；等待用户完成配置后重试，不要将它诊断为 Worker Secret 错误。

## 7. 前端验收

1. 打开 `PAGES_ORIGIN`。
2. 在 VoiceNest「设置 → 公众号草稿箱」填写测试 Worker URL。
3. 点击“重新授权”；用户在 Access 页面登录后返回应用。
4. 点击“测试连接”。
5. 选择内置默认封面或一张本地 PNG/JPEG/WebP 图片，点击上传；确认上传成功。此操作只会创建该公众号的永久图片素材，不会发布文章。
6. 测试连接成功后，至少验证一次“预览排版”。
7. 只有用户提供了准备好的测试文章或录音时，才点击“发布到草稿箱”。只创建草稿，绝不群发。

## 8. 最终报告

最终只报告：

- Cloudflare Pages URL
- 测试 Worker URL
- 测试 KV 名称
- Access 是否已启用
- 连接测试、排版预览、草稿创建的结果
- 仍需用户手动完成的步骤
- 本地未提交变更

最终不得输出 Secret、AppID、AppSecret、`media_id`、Access 邮箱、Cookie、Token 或密码。
