# 公众号默认封面上传实施计划

**目标：** 由用户在设置页上传默认封面，Worker 将其转为微信公众号永久素材并保存到该部署者的 KV；草稿只能使用该封面。

**架构：** 前端以 data URL 调用受 Access 保护的 Worker。Worker 校验图片、以 `FormData` 调用微信 `material/add_material`、将返回的 `media_id` 写入 KV；草稿创建和更新读取同一 KV key。前端只读取封面是否已配置，不保存图片或 `media_id`。

## 约束

- 仅 PNG、JPEG、WebP，单张最多 5 MiB；不恢复生图、单篇封面或图片备份。
- 删除 `WECHAT_COVER_MEDIA_ID` 与 Worker 侧个人封面；将现有图片移至前端，作为用户可选、可替换的示例默认封面。
- `GET /cover` 与 `POST /cover` 必须沿用 Access、精确 Origin 和 credentials；Access CORS 增加 `GET`。

### Task 1：Worker 保存并使用默认封面

**文件：**

- Create: `workers/wechat-draft/src/images.ts`
- Create: `workers/wechat-draft/src/images.test.ts`
- Modify: `workers/wechat-draft/src/types.ts`
- Modify: `workers/wechat-draft/src/wechat.ts`
- Modify: `workers/wechat-draft/src/wechat.test.ts`
- Modify: `workers/wechat-draft/src/index.ts`
- Modify: `workers/wechat-draft/src/index.test.ts`
- Delete: `workers/wechat-draft/assets/default-wechat-cover.png`
- Create: `src/assets/default-wechat-cover.png`

- [x] 写失败测试：data URL 只接受 PNG/JPEG/WebP 且解码后不超过 5 MiB；`POST /cover` 成功时调用 `material/add_material?type=image` 并将 `media_id` 写入 `wechat:default-cover-media-id`；没有 KV 封面时 `/drafts` 返回 422 `COVER_NOT_CONFIGURED`。
- [x] 在 `images.ts` 实现 `parseImageDataUrl(dataUrl): { blob: Blob; mimeType: string }`，使用正则提取 MIME/base64、`atob` 解码并验证字节数；错误统一为中文可操作消息。
- [x] 在 `wechat.ts` 实现 `uploadCover(env, image)`：获取 token，以 `FormData` 添加 `media` Blob，调用永久素材接口并返回 `media_id`；将 `createDraft` / `updateDraft` 改为接收已解析的 `DraftArticle`，不再从 Env 注入封面。
- [x] 在 `index.ts` 实现 `GET /cover`（只返回 `{ configured: boolean }`）和 `POST /cover`（接收 `{ dataUrl }`，上传并写 KV）；将草稿文章构造改为异步读取 KV 封面，并把 OPTIONS 允许方法更新为 `GET, POST, OPTIONS`。
- [x] 更新 Worker 测试 Env，删除 `WECHAT_COVER_MEDIA_ID`；运行 `npm --prefix workers/wechat-draft test` 与 `npm --prefix workers/wechat-draft run check`。

### Task 2：设置页上传与状态反馈

**文件：**

- Modify: `src/lib/wechat.ts`
- Modify: `src/lib/wechat.test.ts`
- Modify: `src/pages/SettingsPage.tsx`

- [x] 在 `src/lib/wechat.ts` 增加 `getWechatCoverStatus(config)` 和 `uploadWechatCover(config, file)`；前者请求 `GET /cover`，后者在浏览器读取 File data URL 后 POST `/cover`。响应结构必须校验，不将 `media_id` 暴露到前端。
- [x] 扩展错误归一化：Worker 返回 `COVER_NOT_CONFIGURED` 时显示“请先在设置中上传公众号默认封面”。
- [x] 将现有默认图片移至 `src/assets` 并在设置页公众号折叠区展示；未配置时提供“使用默认封面”按钮。增加原生 `input[type=file]`（accept PNG/JPEG/WebP）、上传前的本地预览、上传/替换按钮、禁用与加载状态，以及由 `GET /cover` 获取的“已配置/未配置”状态。客户端先拒绝非图片和大于 5 MiB 的文件。
- [x] 写/更新客户端测试，覆盖状态请求、合法上传、无效响应与 `COVER_NOT_CONFIGURED` 错误；运行 `npm test` 与 `npm run build`。

### Task 3：移除旧 Secret 并更新部署契约

**文件：**

- Modify: `workers/wechat-draft/wrangler.jsonc`
- Modify: `workers/wechat-draft/.dev.vars.example`
- Modify: `README.md`
- Modify: `docs/cloudflare-pages-test-deployment.md`
- Modify: `.trellis/spec/backend/wechat-access-cors.md`

- [x] 从 Wrangler required secrets、`.dev.vars.example`、README 和测试部署指南删除 `WECHAT_COVER_MEDIA_ID`；明确首次部署后在设置页上传封面。
- [x] 将 Access CORS 与 Worker CORS 的允许方法更新为 `GET, POST, OPTIONS`；`GET /cover` 不返回 `media_id` 或图片数据。
- [x] 更新 Worker / Access 契约的错误矩阵、好坏案例和测试要求，记录 KV 默认封面为唯一来源。
- [x] 运行全量检查：`npm test`、`npm run build`、`npm --prefix workers/wechat-draft test`、`npm --prefix workers/wechat-draft run check` 与 `git diff --check`。
