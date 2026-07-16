# Cloudflare Pages + Worker 全链路测试指南

> 交给 AI 代理时只需说：**“请阅读 `docs/cloudflare-pages-test-deployment.md`，并严格按其中步骤执行。”**

本指南用于一次不影响现有生产服务的全链路测试：Cloudflare Pages、独立 Worker、KV、Secret、Cloudflare Access、CORS 与微信公众号草稿箱。测试只允许创建草稿，绝不群发文章。

## 0. 安全边界

- 只使用 Cloudflare Pages；本次测试不使用 Vercel。
- 测试 Worker、Pages 项目和 KV 名称必须与生产资源不同。推荐 Worker 名称：`voicenest-wechat-draft-test`；推荐 Pages 项目名：`voicenest-test`。
- 可以读取 `workers/wechat-draft/.dev.vars`，但不得打印、复制到聊天、写入日志、提交 Git、写入前端环境变量或备份文件。
- 不索取、不保存账户密码、Cookie 或长期 API Token。代理使用当前浏览器和 Wrangler 的已授权会话完成 Cloudflare、GitHub 与 Access 交互；不得将这些交互变成用户的部署配置任务。
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

此步骤由 AI 代理优先通过 Cloudflare Access API 完成；创建前确认目标应用不存在，且仅覆盖测试 Worker 的 `workers.dev` 域名。

1. 创建自托管 Access 应用，域名为测试 Worker 的 `workers.dev` 地址，不显示在 App Launcher。
2. 创建唯一 Allow 策略，仅包含 `.dev.vars` 中的 `ACCESS_EMAIL`；不得加入通配符、全员或生产邮箱。
3. 写入 Access CORS：Allowed origins 为 `PAGES_ORIGIN`；Android 测试时才额外加入 `https://localhost`；允许方法 `GET`、`POST`、`OPTIONS`；允许请求头 `Content-Type`；启用 credentials；将 `options_preflight_bypass` 显式设为关闭。
4. 验证 Access 应用的域名、唯一策略、CORS 配置均准确，且未登录请求被重定向到 Access，而不是直接返回 Worker 内容。

Worker 的 `ALLOWED_ORIGINS` 与 Access CORS 必须一致。CORS 不是鉴权；Access 才负责限制公众号 Secret 的使用者。

代理必须使用具备 `Access: Apps and Policies Write` 的当前授权会话完成此步骤；若会话需要重新授权，代理在当前浏览器中完成 OAuth/授权流程，但不得要求用户手动配置 Access 资源。

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

1. 代理打开 `PAGES_ORIGIN`，在 VoiceNest「设置 → 公众号草稿箱」填写测试 Worker URL。
2. 代理点击“重新授权”，使用当前浏览器已授权会话完成 Access 回跳；不得要求用户手动配置或复制 Cookie。
3. 代理点击“测试连接”。若返回 `40164` 或 `WECHAT_IP_NOT_ALLOWED`，暂停等待用户完成第 6 节的公众号白名单后重试。
4. 代理选择内置默认封面或一张本地 PNG/JPEG/WebP 图片，点击上传并确认成功。此操作只会创建该公众号的永久图片素材，不会发布文章。
5. 测试连接成功后，代理至少验证一次“预览排版”。
6. 只有用户提供了准备好的测试文章或录音时，代理才点击“发布到草稿箱”。只创建草稿，绝不群发。

## 8. 部署交付报告

完成后，代理必须按以下格式交付报告。未使用的项目写“未部署”或“不适用”，未完成的项目写“待用户完成”；不得省略。

```text
# VoiceNest 部署交付报告

## 已部署资源
- 使用模式：网页 / 仅 Android APK / 网页与 Android APK
- 前端：Cloudflare Pages URL，或“未部署（仅 APK）”
- Worker 后端：https://<worker-name>.<account-subdomain>.workers.dev
- KV：<namespace 名称>
- Cloudflare Access：已启用 / 未启用
- Access 策略：仅允许 .dev.vars 中的 ACCESS_EMAIL（不显示实际邮箱）
- 已配置来源：<PAGES_ORIGIN、https://localhost，或两者>

## 在 VoiceNest 中如何填写
### 网页端
1. 打开前端 URL。
2. 进入「设置 → 公众号草稿箱」，启用该功能。
3. “公众号发布服务地址”填写：<Worker 后端 URL>。
4. 点击“重新授权”，在 Cloudflare Access 页面使用 ACCESS_EMAIL 对应的邮箱登录；成功后返回应用。
5. 点击“测试公众号连接”，再上传内置或自选默认封面。

### Android APK
1. 安装 APK。仅使用 APK 时无需部署 Pages。
2. 确认 Worker 的 ALLOWED_ORIGINS 与 Access CORS 都包含 https://localhost；网页与 APK 同时使用时，两处都必须同时包含 Pages URL 和 https://localhost。
3. 进入「设置 → 公众号草稿箱」，填写同一个 Worker 后端 URL，然后按网页端的“重新授权、测试连接、上传封面”步骤操作。

## ACCESS_EMAIL 的用途
- 它在第 5 节被写入 Cloudflare Access 的唯一 Allow 策略。
- 它不填写在 VoiceNest 设置页，也不属于 Worker Secret。
- 用户点击“重新授权”后，必须用该邮箱对应的 Access 身份完成登录；报告只说明该策略是否已配置，不显示邮箱值。

## 上线前仍需用户完成
- [ ] 在微信公众号后台添加 Cloudflare API 调用 IP 白名单，并重新运行“测试公众号连接”。
- [ ] 在 VoiceNest 设置中配置可用的 ASR 与 LLM 服务；它们是“录音 → 转写 → 润色”流程的必要条件。
- [ ] 如需同步笔记，再配置 Fast Note Sync（Obsidian）；如不需要可跳过。
- [ ] 如需发布公众号草稿，完成默认封面上传；只预览排版可不创建草稿。

## 验收结果
- Access 登录：通过 / 待完成
- 连接测试：通过 / 待 IP 白名单 / 失败（原因）
- 排版预览：通过 / 未执行
- 草稿创建：通过 / 未执行 / 失败（原因）
- 本地未提交变更：<路径或“无”>
```

最终不得输出 Secret、AppID、AppSecret、`media_id`、Access 邮箱、Cookie、Token 或密码。
