# 微信公众号草稿自动同步设计

**状态**：已获用户确认，待制定实施计划  
**目标**：个人使用场景中，VoiceNest 完成 ASR 和 LLM Markdown 整理后，自动将文章写入个人微信公众号草稿箱；不自动正式发布。

## 已确认范围

- 保留现有 Obsidian 同步，公众号草稿为独立同步目标；任一目标失败不得覆盖另一目标的结果。
- 仅单一管理员使用，不建设用户注册、CMS、博客、正文图床、正文图片、多账号或自动群发。
- 文章共用一张由管理员在公众号后台手动上传的默认封面，Worker 只保存其 `media_id`。
- 草稿默认关闭留言；Markdown 原文继续保存在 VoiceNest 和 Obsidian，公众号只保存渲染后的 HTML。
- “自动”沿用现有前台处理模型：PWA 在线且前台运行时执行；应用关闭后不承诺后台发布。

## 架构

```text
VoiceNest PWA（Vercel）
  └─ LLM 输出 title + markdown
       ├─ Fast Note Sync → Obsidian
       └─ Cloudflare Access 保护的 Worker
            ├─ Workers Secret：AppID / AppSecret / 默认封面 media_id
            ├─ Workers KV：access_token 与短期幂等记录
            ├─ Markdown → 微信兼容内联 HTML
            └─ 微信公众号 draft/add、draft/update
```

- Worker 使用自定义域名，Cloudflare Access 仅允许管理员身份访问；CORS 仅允许 VoiceNest 的生产域名。CORS 不是鉴权机制。
- `AppSecret` 不得进入 Vite 构建产物、localStorage、备份导出或客户端请求体。Worker 使用 Cloudflare Secret 保存敏感值。
- 公众号 IP 白名单录入经实测可用的 Cloudflare Worker 出站网段。白名单范围较宽，因此访问控制和密钥保护为主要安全边界。
- Worker 使用 KV 缓存微信 `access_token`，并以 PWA 预先保存的 `requestId` 记录成功草稿结果，防止网络响应丢失后的重复创建。

## Worker 接口

### `POST /connection-test`

仅验证 Access 身份、Worker Secret 和获取微信 `access_token` 的能力；不创建草稿。微信返回 `40164` 时，返回可直接用于白名单排障的中文错误。

### `POST /drafts`

请求字段：`recordingId`、`requestId`、`title`、`markdown`、可选 `draftMediaId`。

- 无 `draftMediaId` 时创建草稿；同一 `requestId` 已成功时返回既有草稿 ID。
- 有 `draftMediaId` 时更新对应草稿，用于编辑后的“重新同步”。
- Worker 自行渲染 Markdown；不接受客户端传入 HTML。渲染器禁用 Markdown 原始 HTML，并只生成标题、段落、列表、引用、代码、链接等固定内联样式。
- Worker 对标题、正文大小和微信返回错误做验证与中文映射；草稿创建时固定使用默认封面，且显式关闭评论。

## VoiceNest 改动边界

- 新增 `src/lib/wechat.ts`，只封装 Worker 请求、连接测试和错误类型。
- `src/lib/config-store.ts` 增加公众号 Worker URL 与启用开关；不新增任何公众号密钥字段。
- `Recording` 增加 `wechatStatus`、`wechatDraftMediaId`、`wechatErrorMessage`、`wechatRequestId`，与现有总处理状态并存。
- `use-processor.ts` 在 LLM 完成后分别执行已启用的 Obsidian 和公众号目标；公众号失败可独立重试，不重复执行 ASR/LLM。
- 设置页增加“公众号草稿同步”配置、Access 授权入口和连接测试；列表与详情页展示草稿状态并提供重新同步。

## 开源调研与采用结论

- `references/doocs-md`（doocs/md，WTFPL）：成熟的微信 Markdown 排版器和 Cloudflare Workers 部署参考。仅借鉴微信内联样式、兼容性边界；不集成其 Vue 编辑器、多图床或内容管理模块。
- `references/wechat-publisher`（jiji262/wechat-publisher，MIT）：参考 `access_token` 提前刷新、封面素材与正文素材的差异、`draft/add` 以及错误码处理和 mock 测试方式。其搜索、AI 配图、质量打分和多平台同步不纳入本项目。

## 部署前人工准备

1. 在公众号后台启用开发者能力，获取 AppID 与 AppSecret。
2. 手动上传默认封面到永久素材，取得 `media_id`。
3. 在 Cloudflare 创建 Worker、KV、Worker Secrets 和 Access 应用；绑定自定义 Worker 域名。
4. 调用 `connection-test`，根据微信白名单错误或已验证网段更新公众号 IP 白名单，直到测试成功。

## 验证与验收

- 单元测试覆盖：禁用原始 HTML 的渲染、草稿请求体、token 缓存、同一 `requestId` 幂等返回、微信错误映射，以及 PWA 公众号客户端。
- 现有 `npm test`、`npm run build` 继续通过；Worker 使用模拟微信响应进行本地测试。
- 真机验收：完成一条录音后自动出现公众号草稿；公众号后台可查看标题、默认封面与正文；断网、Access 过期和白名单错误均有明确提示；修改 Markdown 后重新同步更新同一草稿；Obsidian 成功而公众号失败时两个结果分别可见。

## 显式排除

- 自动正式发布、群发、留言管理、数据统计。
- 正文图片、图床、封面自动生成、多个公众号账号。
- PWA 关闭后的后台队列、服务端转写或服务端 LLM 调用。
