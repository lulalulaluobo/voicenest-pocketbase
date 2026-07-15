# Agnes 公众号封面探索设计

**状态**：已获用户确认，待审阅  
**目标**：在独立功能分支验证 Agnes 图像生成 API，并为公众号草稿提供可选的 AI 生成封面；未生成封面时继续使用当前默认封面。

## 已确认决策

- 使用 `agnes-image-2.0-flash`，不使用文本模型 `agnes-2.0-flash` 生成图片。
- 封面及参考图优先保存到当前设备的 IndexedDB，不使用 R2；不跨设备同步。
- 生图提示词采用类似“笔记分类管理”的独立管理入口，而非直接堆在公众号连接配置内。
- 每个生图模板可包含名称、文本提示词与可选参考图；用户可新增、编辑、删除。
- 公众号编辑页选择模板后，以模板提示词、参考图、公众号文章标题和正文作为上下文生成封面并展示。
- 发布草稿时才将生成封面上传为微信公众号永久图片素材，获得 `media_id` 后作为 `thumb_media_id`；没有有效生成封面则回退 `WECHAT_COVER_MEDIA_ID` 默认封面。

## 安全与密钥

- 已在聊天中暴露的 Agnes Key 不得使用，用户必须在 Agnes 控制台撤销并重新生成。
- 新 Key 只允许通过 Worker Secret（生产）或被 `.gitignore` 排除的 `workers/wechat-draft/.dev.vars`（本地测试）提供，变量名为 `AGNES_API_KEY`。
- PWA 配置、备份文件、IndexedDB 记录、日志、Git 历史和 Worker 响应均不得包含 API Key。
- 本地验证只允许请求 Agnes；生产草稿发布仍继续由 Cloudflare Access 保护。

## 探索顺序

```text
本地 Worker + 新 Key
  → Agnes 文生图 API 冒烟测试
  → 验证模型名、响应格式、横图尺寸与图片大小
  → 验证参考图输入的图生图请求
  → 通过后再接入 PWA 模板、封面预览和微信永久素材上传
```

若 API 不支持 2.35:1 指定尺寸或参考图输入，探索分支只记录实际能力和失败响应，不进入主分支或替换默认封面。

## 2026-07-15 冒烟测试结论

- 使用新的本地 `AGNES_API_KEY` 调用 `agnes-image-2.0-flash` 成功，`1200x510` 横图请求返回 PNG（约 1.57 MiB）。
- 该服务拒绝顶层 `response_format` 参数；Worker 已移除它，并仅在图生图的 `extra_body` 中保留 `response_format: "url"`。
- 本机 PNG data URL 参考图请求两次均未报参数格式错误，均进入上游生成队列后因 `image queue is full` 返回临时失败。因此 data URL 协议尚未获得图片级成功验证，但不构成“不支持”的证据；客户端必须显示可重试错误并保持默认封面回退。

## 数据与接口

### 本地配置

新增 `ImagePromptTemplate`：

```ts
interface ImagePromptTemplate {
  id: string
  name: string
  prompt: string
  referenceImage?: Blob
  referenceImageMimeType?: string
}
```

文本提示词仍以本地配置键保存；因 `localStorage` 不能保存 `Blob`，带参考图的生图模板改存入现有 Dexie 的新表。参考图 Blob 只存在当前浏览器。设置页提供管理列表和独立编辑页/弹窗，支持新增、修改和删除，复用笔记分类管理的交互层级。

### 录音封面

在 `Recording` 增加可选本地字段：

```ts
wechatCoverBlob?: Blob
wechatCoverMimeType?: string
```

生成成功后保存这些字段并在公众号编辑页预览；不保存远程 Agnes URL。删除录音时现有 IndexedDB 记录删除流程一并删除 Blob。

### Worker

探索成功后增加两类受 Access 保护的请求：

- `POST /cover/generate`：接收模板文本、公众号文章摘要和可选参考图，调用 Agnes；仅返回生成图的安全二进制/数据，不创建微信素材或草稿。
- 扩展 `POST /drafts`：可选接收生成封面；Worker 以 multipart 上传为微信永久 `image` 素材，再使用所得 `media_id` 创建或更新草稿。没有封面时继续使用默认封面。

所有图片输入与输出必须限制 MIME 为 PNG/JPEG/WebP，单张不超过 5 MiB，并在转换为 base64/Blob 前校验。Agnes 公开资料将图生图参考图描述为 URL 输入；探索先用本机 data URL 实测其是否接受。若不接受，不能在“不用图床”的已确认边界下实现参考图上下文，必须停止集成并记录结论。

## 公众号编辑页流程

```text
选择生图模板 → 组合模板 + 文章标题/正文 + 可选参考图
  → 生成封面 → 本地显示、可重新生成或清除
  → 预览文章排版 → 发布草稿
     ├─ 有封面：上传永久素材并使用该 media_id
     └─ 无封面：使用默认 media_id
```

生成封面不是发布动作。封面生成/上传失败须显示中文错误，既不覆盖个人笔记，也不改变已有 Obsidian 同步状态。

## 验收边界

- 冒烟测试必须使用用户重新生成的本地/Worker Secret，不使用聊天中已暴露的 Key。
- 成功时确认 Agnes 返回可显示图片、可接受横图请求，且参考图请求被接受；失败时保留默认封面并输出可诊断结论。
- 生图模板在刷新后保持；封面图在同一设备的录音详情中保持。
- 生成封面发布后，微信公众号草稿使用新上传的 `thumb_media_id`；未生成封面时保持默认封面行为。
- 不实现图片云备份、跨设备同步、正文插图、图床、自动发布或批量生成。
