# Agnes 公众号封面探索实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在独立分支验证 Agnes 图像 API，并在验证通过后让用户选择本机保存的生图模板，为公众号草稿使用可选的 AI 封面；没有有效封面时继续使用默认封面。

**Architecture:** PWA 只在 IndexedDB 保存模板参考图和已生成封面，永远不持有 Agnes 密钥。PWA 将文章上下文与可选 data URL 发送给现有 Cloudflare Worker；Worker 通过 `AGNES_API_KEY` 调 Agnes，下载并校验结果后返回安全 data URL。发布草稿时，Worker 才把该 data URL 上传为微信永久图片素材，并将取得的 `media_id` 作为 `thumb_media_id`。

**Tech Stack:** React + TypeScript + Dexie + Vitest；Cloudflare Workers + KV + 原生 `fetch`/`FormData`；Agnes `POST https://apihub.agnes-ai.com/v1/images/generations`；微信公众号永久素材与草稿接口。

## Global Constraints

- 只在 `codex/agnes-cover-exploration` 分支实施；不修改现有默认封面回退逻辑。
- 不新增 npm 依赖、不引入 R2、图床、CMS、跨设备同步、正文插图、批量生成或自动发布。
- Agnes 模型固定为 `agnes-image-2.0-flash`；生产密钥只以 Worker Secret `AGNES_API_KEY` 保存，本地只由已忽略的 `workers/wechat-draft/.dev.vars` 提供。
- 已在聊天暴露的旧密钥不得使用、打印、写入文件、Git 历史、PWA 配置、备份文件或日志；开始真实请求前，用户必须在 Agnes 控制台撤销它并自行写入新密钥。
- 仅接受 `image/png`、`image/jpeg`、`image/webp` data URL；输入和输出各不超过 5 MiB；文章标题最多 64 字符，正文沿用当前 Worker 的 20,000 字符/1 MiB 限制。
- 生图请求不改变 `summary`、`transcript`、Obsidian 同步状态或已有公众号草稿；生成失败保留已保存封面，发布时无封面则使用 `WECHAT_COVER_MEDIA_ID`。
- Agnes 公开资料显示参考图字段为 URL；本机 data URL 能否作为 `extra_body.image` 被接受必须先实测。若被拒绝，本分支只记录接口结论，不绕过用户的“无需图床”决策。

---

## 文件结构与接口

| 文件 | 责任 |
| --- | --- |
| `workers/wechat-draft/src/agnes.ts` | 构造封面提示词、调用 Agnes、解析 URL/base64 返回、下载并校验图片。 |
| `workers/wechat-draft/src/images.ts` | 校验 data URL 并将其转换为微信 `FormData` 素材。 |
| `workers/wechat-draft/src/types.ts` | Worker 请求、响应、图片及环境类型。 |
| `workers/wechat-draft/src/index.ts` | `/cover/generate` 路由、请求校验、将封面转交草稿流程。 |
| `workers/wechat-draft/src/wechat.ts` | 上传永久图片素材，并优先采用其 `media_id`。 |
| `src/lib/image-prompt-store.ts` | IndexedDB 中生图模板及可选 Blob 参考图的 CRUD。 |
| `src/lib/config-store.ts` | 公众号文本提示词的默认值与 CRUD，移除设置页内联编辑耦合。 |
| `src/domain/recording.ts` | 可选的生成封面 Blob 字段。 |
| `src/lib/recording-db.ts` | Dexie schema v3 的模板表。 |
| `src/lib/wechat.ts` | 生图、封面 data URL、发布草稿的 PWA 客户端协议。 |
| `src/pages/SettingsPage.tsx` | 公众号提示词与生图提示词的独立列表/抽屉管理。 |
| `src/pages/WechatEditorPage.tsx` | 选择生图模板、生成/替换/清除封面，并在发布时传递封面。 |

### 跨任务接口（先固定，避免各层各自猜测）

```ts
// src/lib/image-prompt-store.ts
export interface ImagePromptTemplate {
  id: string
  name: string
  prompt: string
  referenceImage?: Blob
  referenceImageMimeType?: 'image/png' | 'image/jpeg' | 'image/webp'
}
export function listImagePromptTemplates(): Promise<ImagePromptTemplate[]>
export function saveImagePromptTemplate(template: ImagePromptTemplate): Promise<void>
export function deleteImagePromptTemplate(id: string): Promise<void>

// src/lib/wechat.ts
export interface WechatCoverImage {
  dataUrl: string
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp'
}
export function generateWechatCover(
  config: WechatDraftConfig,
  input: { title: string; markdown: string; prompt: string; referenceImageDataUrl?: string }
): Promise<WechatCoverImage>

// workers/wechat-draft/src/types.ts
export interface CoverGenerateRequest {
  title: string
  markdown: string
  prompt: string
  referenceImageDataUrl?: string
}
export interface DraftRequest {
  recordingId: string
  requestId: string
  title: string
  markdown: string
  draftMediaId?: string
  coverImage?: WechatCoverImage
}
```

### Task 1: 验证 Agnes 协议与图片边界（必须先过门槛）

**Files:**
- Create: `workers/wechat-draft/src/agnes.ts`
- Create: `workers/wechat-draft/src/agnes.test.ts`
- Create: `workers/wechat-draft/src/images.ts`
- Create: `workers/wechat-draft/src/images.test.ts`
- Modify: `workers/wechat-draft/src/types.ts`
- Modify: `workers/wechat-draft/src/index.ts`
- Modify: `workers/wechat-draft/src/index.test.ts`

**Consumes:** `Env`、当前 CORS 验证和 `json()` 响应函数。

**Produces:** `generateAgnesCover(env, request, fetchFn)`、`parseImageDataUrl()`、仅接受源站请求的 `POST /cover/generate`。

- [ ] **Step 1: 先写 Agnes 请求体与响应解析的失败测试。**

```ts
it('asks Agnes for a single landscape cover and returns its downloaded PNG as a data URL', async () => {
  const fetchFn = vi.fn()
    .mockResolvedValueOnce(jsonResponse({ data: [{ url: 'https://cdn.agnes.test/cover.png' }] }))
    .mockResolvedValueOnce(new Response(PNG_BYTES, { headers: { 'Content-Type': 'image/png' } }))

  await expect(generateAgnesCover(env, {
    title: '睡眠与学习', markdown: '今天我意识到……', prompt: '温暖克制的横版封面'
  }, fetchFn)).resolves.toMatchObject({ mimeType: 'image/png', dataUrl: expect.stringMatching(/^data:image\/png;base64,/) })

  expect(JSON.parse(fetchFn.mock.calls[0][1].body)).toMatchObject({
    model: 'agnes-image-2.0-flash', size: '1200x510', n: 1, response_format: 'url'
  })
})

it('passes a local data URL only through extra_body.image for the reference-image probe', async () => {
  await generateAgnesCover(env, { ...input, referenceImageDataUrl: PNG_DATA_URL }, fetchFn)
  expect(JSON.parse(fetchFn.mock.calls[0][1].body)).toMatchObject({
    tags: ['img2img'], extra_body: { image: [PNG_DATA_URL], response_format: 'url' }
  })
})

it('rejects an Agnes result that is not PNG, JPEG, WebP or exceeds 5 MiB', async () => {
  await expect(generateAgnesCover(env, input, fetchReturningHtml)).rejects.toMatchObject({ code: 'AGNES_IMAGE_INVALID' })
})
```

- [ ] **Step 2: 运行失败测试，确认实现尚不存在。**

Run: `npm test -- --run workers/wechat-draft/src/agnes.test.ts workers/wechat-draft/src/images.test.ts`

Expected: FAIL，提示 `generateAgnesCover` 或图片校验函数尚未导出。

- [ ] **Step 3: 以最小 Worker 原生实现请求、下载和校验。**

```ts
const AGNES_URL = 'https://apihub.agnes-ai.com/v1/images/generations'
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

export async function generateAgnesCover(env: Env, input: CoverGenerateRequest, fetchFn = fetch): Promise<WechatCoverImage> {
  if (!env.AGNES_API_KEY) throw new CoverError('AGNES_NOT_CONFIGURED', '封面生成服务尚未配置')
  const body = {
    model: 'agnes-image-2.0-flash',
    prompt: buildCoverPrompt(input),
    size: '1200x510',
    n: 1,
    response_format: 'url',
    ...(input.referenceImageDataUrl ? { tags: ['img2img'], extra_body: { image: [input.referenceImageDataUrl], response_format: 'url' } } : {})
  }
  const response = await fetchFn(AGNES_URL, {
    method: 'POST', headers: { Authorization: `Bearer ${env.AGNES_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  })
  const result = await response.json().catch(() => null) as { data?: Array<{ url?: string; b64_json?: string }>; error?: { message?: string } } | null
  if (!response.ok || !result?.data?.[0]) throw new CoverError('AGNES_API_ERROR', result?.error?.message || `Agnes 请求失败 (${response.status})`)
  return result.data[0].b64_json ? fromBase64(result.data[0].b64_json) : downloadImage(result.data[0].url, fetchFn)
}
```

`buildCoverPrompt()` 必须包含模板文本、文章标题和正文，并附加“公众号横版封面、约 2.35:1、不要添加任何可读文字或水印”。`downloadImage()` 必须验证 `Content-Type` 和 `ArrayBuffer.byteLength`，再转 data URL；不得向客户端返回 Agnes URL、密钥或上游原始错误体。

- [ ] **Step 4: 添加路由和输入校验测试，然后实现路由。**

```ts
it('returns a validated generated cover without calling WeChat', async () => {
  vi.stubGlobal('fetch', agnesFetchMock)
  const response = await worker.fetch(coverRequest(), createEnv())
  expect(response.status).toBe(200)
  await expect(response.json()).resolves.toMatchObject({ mimeType: 'image/png', dataUrl: expect.stringMatching(/^data:image\/png;base64,/) })
})

if (request.method === 'POST' && url.pathname === '/cover/generate') {
  return handleCoverGenerate(request, env)
}
```

`validateCoverGenerate()` 要求非空 `title`、`markdown`、`prompt`，标题最多 64 字符；若存在 `referenceImageDataUrl`，调用 `parseImageDataUrl()`。错误码为 `INVALID_REQUEST`、`AGNES_NOT_CONFIGURED`、`AGNES_API_ERROR`、`AGNES_IMAGE_INVALID`，对客户端均给中文短消息。

- [ ] **Step 5: 运行 Worker 单元测试与类型检查。**

Run: `npm --prefix workers/wechat-draft test && npm --prefix workers/wechat-draft run check`

Expected: 全部通过；不存在真实 Agnes 网络请求。

- [ ] **Step 6: 用户安全配置新密钥后，进行一次真实本地冒烟测试并记录结论。**

用户自行在 `workers/wechat-draft/.dev.vars` 写入一行 `AGNES_API_KEY=<新密钥>`，不要把值发到聊天或提交 Git。随后运行：

```bash
cd /Users/luluen/ai-project/VoiceNest/workers/wechat-draft
npx wrangler dev
curl -sS -X POST http://127.0.0.1:8787/cover/generate \
  -H 'Origin: https://obvoice.lucc.fun' -H 'Content-Type: application/json' \
  --data '{"title":"测试封面","markdown":"测试正文","prompt":"极简的自然横版封面"}'
```

Expected: 返回仅含 `dataUrl` 与 `mimeType` 的 JSON。接着带一个不超过 5 MiB 的本地 PNG data URL 重试，记录尺寸请求和 `extra_body.image` 的真实接受/拒绝结果到设计文档。若 `1200x510` 或 data URL 被上游拒绝，停止在本任务，不实施 Tasks 2–6，并将上游状态码与脱敏错误写入文档。

- [ ] **Step 7: 提交通过门槛的 Worker 探索实现。**

```bash
git add workers/wechat-draft/src/agnes.ts workers/wechat-draft/src/agnes.test.ts workers/wechat-draft/src/images.ts workers/wechat-draft/src/images.test.ts workers/wechat-draft/src/types.ts workers/wechat-draft/src/index.ts workers/wechat-draft/src/index.test.ts .trellis/tasks/07-12-stage2-processing/agnes-cover-exploration-design.md
git commit -m "feat: 验证 Agnes 公众号封面生成"
codegraph sync
```

### Task 2: 让本机数据库保存模板和生成封面

**Files:**
- Create: `src/lib/image-prompt-store.ts`
- Create: `src/lib/image-prompt-store.test.ts`
- Modify: `src/lib/recording-db.ts`
- Modify: `src/lib/recording-db.test.ts`
- Modify: `src/domain/recording.ts`

**Consumes:** Task 1 的 `WechatCoverImage` MIME 联合类型。

**Produces:** 异步模板 CRUD；录音可持久保存 `wechatCoverBlob` 与 `wechatCoverMimeType`。

- [ ] **Step 1: 写 IndexedDB 模板 CRUD 和录音封面持久化的失败测试。**

```ts
it('persists an image prompt template together with an optional PNG reference', async () => {
  await saveImagePromptTemplate({ id: 'cover-1', name: '自然随笔', prompt: '留白摄影', referenceImage: new Blob(['png'], { type: 'image/png' }), referenceImageMimeType: 'image/png' })
  await expect(listImagePromptTemplates()).resolves.toMatchObject([{ id: 'cover-1', name: '自然随笔', referenceImageMimeType: 'image/png' }])
})

it('persists a generated WeChat cover on its recording', async () => {
  await createRecording(draft)
  await recordingDb.recordings.update(draft.id, { wechatCoverBlob: new Blob(['png'], { type: 'image/png' }), wechatCoverMimeType: 'image/png' })
  expect((await getRecording(draft.id))?.wechatCoverMimeType).toBe('image/png')
})
```

- [ ] **Step 2: 运行失败测试。**

Run: `npm test -- --run src/lib/image-prompt-store.test.ts src/lib/recording-db.test.ts`

Expected: FAIL，提示表或 CRUD 函数不存在。

- [ ] **Step 3: 添加 Dexie v3 表与最小 CRUD。**

```ts
// src/lib/recording-db.ts
imagePromptTemplates!: Table<ImagePromptTemplate, string>
this.version(3).stores({
  recordings: 'id, createdAt, status, typeId',
  audioChunks: 'id, recordingId, [recordingId+index]',
  imagePromptTemplates: 'id'
})

// src/lib/image-prompt-store.ts
export async function listImagePromptTemplates() { return recordingDb.imagePromptTemplates.toArray() }
export async function saveImagePromptTemplate(template: ImagePromptTemplate) { await recordingDb.imagePromptTemplates.put(template) }
export async function deleteImagePromptTemplate(id: string) { await recordingDb.imagePromptTemplates.delete(id) }
```

`ImagePromptTemplate` 的图片 MIME 只允许 PNG/JPEG/WebP；设置页读取文件时同样要检查 `file.size <= 5 * 1024 * 1024`。Blob 不进入 `localStorage` 或 JSON 备份。

- [ ] **Step 4: 运行测试、全量前端测试和构建。**

Run: `npm test && npm run build`

Expected: 全部测试通过；构建成功（可保留已有 chunk-size 警告）。

- [ ] **Step 5: 提交本机存储实现。**

```bash
git add src/lib/image-prompt-store.ts src/lib/image-prompt-store.test.ts src/lib/recording-db.ts src/lib/recording-db.test.ts src/domain/recording.ts
git commit -m "feat: 保存生图模板与公众号封面"
codegraph sync
```

### Task 3: 将公众号与生图提示词改为独立管理入口

**Files:**
- Modify: `src/lib/config-store.ts`
- Modify: `src/lib/wechat.test.ts`
- Modify: `src/pages/SettingsPage.tsx`

**Consumes:** `WechatPromptTemplate`、Task 2 的异步 `ImagePromptTemplate` CRUD。

**Produces:** 可新增、编辑、删除的两类提示词列表；公众号连接区只保留开关、地址、连接测试和授权。

- [ ] **Step 1: 先补充公众号文本模板 CRUD 的失败测试。**

```ts
it('adds, updates and removes an editable WeChat prompt template', () => {
  saveWechatPromptTemplates([{ id: 'custom', name: '读书笔记', prompt: '改写成克制的读书笔记' }])
  expect(getWechatPromptTemplates()).toEqual([{ id: 'custom', name: '读书笔记', prompt: '改写成克制的读书笔记' }])
})
```

- [ ] **Step 2: 实现模板列表与两个编辑抽屉，不在公众号连接区内联 textarea。**

`SettingsPage` 新增 `editingWechatPrompt` 与 `editingImagePrompt` 状态。每类各用一个设置卡片，行项目展示“名称 + 提示词摘要 + ›”，最后一行是“＋ 新增…”。公众号模板抽屉字段为 `名称`、`提示词`；生图模板抽屉字段为 `名称`、`生图提示词`、`参考图（可选）`，以及仅在已有图片时显示的“移除参考图”。

```tsx
<section className="settings-card">
  <h3>公众号提示词管理</h3>
  {wechatPromptTemplates.map((template) => <div className="row" key={template.id} onClick={() => setEditingWechatPrompt(template)}>…</div>)}
  <div className="row" onClick={handleAddWechatPrompt}>＋ 新增公众号提示词</div>
</section>
```

保存时名称与提示词都 `trim()` 且不能为空；删除需 `window.confirm`，但不强制保留默认三条，避免再次把“模板”误当系统配置。删除文本模板不会改已经保存的公众号正文；删除图片模板不会删除录音中已生成的封面。

- [ ] **Step 3: 跑配置单测、人工验证设置页。**

Run: `npm test -- --run src/lib/wechat.test.ts && npm run dev`

Expected: 单测通过；在设置中新增、修改、删除两类模板并刷新页面，文本模板仍保留，图片模板及参考图仍保留；“公众号草稿箱”展开后不显示任何提示词 textarea。

- [ ] **Step 4: 提交提示词管理 UI。**

```bash
git add src/lib/config-store.ts src/lib/wechat.test.ts src/pages/SettingsPage.tsx
git commit -m "feat: 独立管理公众号与生图提示词"
codegraph sync
```

### Task 4: 在公众号编辑页生成、预览与管理封面

**Files:**
- Modify: `src/lib/wechat.ts`
- Modify: `src/lib/wechat.test.ts`
- Modify: `src/pages/WechatEditorPage.tsx`

**Consumes:** Task 2 的本机模板库、Task 1 的 `/cover/generate` 响应。

**Produces:** 录音的可选本地封面；只有用户点击“生成封面”才请求 Agnes。

- [ ] **Step 1: 为前端请求及封面数据 URL 转换写失败测试。**

```ts
it('posts article context and an optional reference data URL to the cover endpoint', async () => {
  vi.mocked(globalThis.fetch).mockResolvedValueOnce(new Response(JSON.stringify({ mimeType: 'image/png', dataUrl: PNG_DATA_URL })))
  await expect(generateWechatCover(config, { title: '标题', markdown: '正文', prompt: '极简封面' })).resolves.toEqual({ mimeType: 'image/png', dataUrl: PNG_DATA_URL })
  expect(globalThis.fetch).toHaveBeenCalledWith('https://wechat-api.lucc.fun/cover/generate', expect.objectContaining({ method: 'POST', credentials: 'include' }))
})
```

- [ ] **Step 2: 实现客户端协议和编辑页最小交互。**

```ts
const [imageTemplates, setImageTemplates] = useState<ImagePromptTemplate[]>([])
const [imageTemplateId, setImageTemplateId] = useState('')
const [isGeneratingCover, setIsGeneratingCover] = useState(false)

const coverBlob = recording.wechatCoverBlob
const coverUrl = coverBlob ? URL.createObjectURL(coverBlob) : ''
```

载入录音时异步加载 `listImagePromptTemplates()`；点击生成时：读取选中模板的 Blob 为 data URL，调用 `generateWechatCover()`，将返回 data URL 转回 `Blob`，再以 `{ wechatCoverBlob, wechatCoverMimeType }` 更新 `recordingDb.recordings`。页面显示封面 `<img>`、`重新生成` 和 `清除封面`；清除只将两个封面字段置为 `undefined`。`coverUrl` 必须在 `useEffect` cleanup 中 `URL.revokeObjectURL()`，禁止每次 render 新建不释放的 URL。

编辑页保持现有“公众号提示词”下拉框，仅选择模板，不能编辑提示词。生成、预览、发布任一进行时禁用其余请求按钮，错误文字明确为“封面生成失败：…”。

- [ ] **Step 3: 跑单测和浏览器人工验证。**

Run: `npm test && npm run build`

Expected: 单测与构建通过；选择模板后生成一张封面、刷新仍可见、清除后封面区域回到“将使用默认公众号封面”。

- [ ] **Step 4: 提交编辑页封面流程。**

```bash
git add src/lib/wechat.ts src/lib/wechat.test.ts src/pages/WechatEditorPage.tsx
git commit -m "feat: 在公众号编辑页生成封面"
codegraph sync
```

### Task 5: 发布时上传微信永久素材并覆盖默认封面

**Files:**
- Modify: `workers/wechat-draft/src/images.ts`
- Modify: `workers/wechat-draft/src/types.ts`
- Modify: `workers/wechat-draft/src/wechat.ts`
- Modify: `workers/wechat-draft/src/wechat.test.ts`
- Modify: `workers/wechat-draft/src/index.ts`
- Modify: `workers/wechat-draft/src/index.test.ts`
- Modify: `src/lib/wechat.ts`
- Modify: `src/lib/wechat.test.ts`
- Modify: `src/pages/WechatEditorPage.tsx`

**Consumes:** `parseImageDataUrl()`、`WechatCoverImage`、现有 `getAccessToken()` 与草稿幂等缓存。

**Produces:** 有生成封面则上传微信永久素材并使用新 `thumb_media_id`；无封面保持当前默认 media ID。

- [ ] **Step 1: 写微信永久素材上传与默认回退的失败测试。**

```ts
it('uploads an optional PNG as permanent material before creating the draft', async () => {
  const fetchFn = vi.fn()
    .mockResolvedValueOnce(jsonResponse({ access_token: 'token', expires_in: 7200 }))
    .mockResolvedValueOnce(jsonResponse({ media_id: 'cover-new' }))
    .mockResolvedValueOnce(jsonResponse({ media_id: 'draft-1' }))
  await createDraft(env, article, fetchFn, PNG_COVER)
  expect(String(fetchFn.mock.calls[1][0])).toContain('/cgi-bin/material/add_material?access_token=token&type=image')
  expect(JSON.parse(fetchFn.mock.calls[2][1].body).articles[0].thumb_media_id).toBe('cover-new')
})

it('uses the configured default media ID when coverImage is absent', async () => {
  await createDraft(env, article, fetchFn)
  expect(JSON.parse(fetchFn.mock.calls[1][1].body).articles[0].thumb_media_id).toBe('cover-media-id')
})
```

- [ ] **Step 2: 实现上传和草稿覆盖，且只在校验成功后上传。**

```ts
export async function uploadPermanentCover(env: Env, cover: WechatCoverImage, fetchFn = fetch): Promise<string> {
  const image = parseImageDataUrl(cover.dataUrl)
  const token = await getAccessToken(env, fetchFn)
  const form = new FormData()
  form.set('media', new Blob([image.bytes], { type: image.mimeType }), `voicenest-cover.${image.mimeType === 'image/png' ? 'png' : image.mimeType === 'image/webp' ? 'webp' : 'jpg'}`)
  const data = await readWechatJson(await fetchFn(`https://api.weixin.qq.com/cgi-bin/material/add_material?access_token=${encodeURIComponent(token)}&type=image`, { method: 'POST', body: form }))
  if (typeof data.media_id !== 'string') throw new WechatApiError(-1, '微信接口未返回封面素材 ID')
  return data.media_id
}

function withCover(env: Env, article: DraftArticle, coverMediaId?: string): DraftArticle {
  return { ...article, thumb_media_id: coverMediaId || env.WECHAT_COVER_MEDIA_ID, need_open_comment: 0, only_fans_can_comment: 0 }
}
```

`handleDraft()` 先在 `validateDraft()` 解析 `coverImage`，再上传；更新同一草稿也采用新封面。上传失败必须返回 `WECHAT_API_ERROR`，不得创建一篇意外使用默认封面的草稿；无 `coverImage` 时不得产生素材上传请求。

- [ ] **Step 3: 将封面连同发布请求传入 Worker 并验证。**

```ts
const coverImage = recording.wechatCoverBlob
  ? { dataUrl: await blobToDataUrl(recording.wechatCoverBlob), mimeType: recording.wechatCoverMimeType! }
  : undefined
await publishWechatDraft(config, { recordingId: recording.id, requestId, title, markdown, draftMediaId: recording.wechatDraftMediaId, coverImage })
```

浏览器不能把超出 5 MiB 的 Blob 转发；若超限，显示“封面文件超过 5 MiB，请重新生成或清除封面”。

- [ ] **Step 4: 运行全量单元测试、类型检查和构建。**

Run: `npm --prefix workers/wechat-draft test && npm --prefix workers/wechat-draft run check && npm test && npm run build`

Expected: 全部通过；Worker 的 fetch mock 明确断言有图时的三次调用顺序为 token、永久素材、草稿，无图时仍为 token、草稿。

- [ ] **Step 5: 提交微信封面上传。**

```bash
git add workers/wechat-draft/src/images.ts workers/wechat-draft/src/types.ts workers/wechat-draft/src/wechat.ts workers/wechat-draft/src/wechat.test.ts workers/wechat-draft/src/index.ts workers/wechat-draft/src/index.test.ts src/lib/wechat.ts src/lib/wechat.test.ts src/pages/WechatEditorPage.tsx
git commit -m "feat: 发布公众号草稿时上传生成封面"
codegraph sync
```

### Task 6: 真实环境验证、部署与探索结论

**Files:**
- Modify: `.trellis/tasks/07-12-stage2-processing/agnes-cover-exploration-design.md`

**Consumes:** Tasks 1–5 的测试通过分支与用户安全配置的 Agnes 新密钥。

**Produces:** 已部署的 Worker/PWA 或带完整失败证据的探索结论。

- [ ] **Step 1: 在部署前重新跑完整验证。**

Run: `npm --prefix workers/wechat-draft test && npm --prefix workers/wechat-draft run check && npm test && npm run build && git diff --check`

Expected: 全部退出码为 0；不暂存或提交 `.dev.vars`、`.wrangler/`、图片二进制测试产物或既有 `.DS_Store` 变更。

- [ ] **Step 2: 使用新密钥部署 Worker Secret，部署 Worker。**

用户在本机交互终端执行（密钥不会出现在命令行历史或聊天）：

```bash
cd /Users/luluen/ai-project/VoiceNest/workers/wechat-draft
npx wrangler secret put AGNES_API_KEY
npx wrangler deploy
```

Expected: Worker 仍绑定 `wechat-api.lucc.fun`；不得将密钥写入 `wrangler.jsonc`。

- [ ] **Step 3: 部署后进行真实端到端检查。**

1. PWA 设置中创建一个文本模板、一个含不超过 5 MiB PNG/JPEG/WebP 的生图模板。
2. 打开一条带 ASR 原文的公众号编辑页，选择公众号文本模板、生成文章，再选择生图模板并生成封面。
3. 确认封面可见，刷新页面仍在；点击“预览排版”不生成或上传微信素材。
4. 点击“发布到草稿箱”，在公众号后台确认草稿封面不是默认图。
5. 清除封面并再次发布，确认草稿恢复使用默认封面；不触碰 Obsidian 同步状态。

- [ ] **Step 4: 写入真实验证结论并提交。**

记录 Agnes 实际响应模式、尺寸是否接受、data URL 参考图是否接受、部署版本与端到端结果；不得写入密钥、完整 data URL 或用户文章内容。

```bash
git add .trellis/tasks/07-12-stage2-processing/agnes-cover-exploration-design.md
git commit -m "docs: 记录 Agnes 封面探索验证结果"
codegraph sync
```

## 自检结果

- **需求覆盖：** Task 3 将两类提示词从公众号连接配置中移出；Tasks 2 与 4 覆盖本机图片模板、选择、生成、持久化与清除；Tasks 1、5 覆盖 Agnes 调用、回退和微信永久素材；Task 6 覆盖真实验证与部署。
- **边界覆盖：** 没有生成图、图片非法/过大、Agnes 失败、微信上传失败、重复草稿请求、删除模板与保留已生成封面均有明确行为。
- **不确定性：** `1200x510` 和本机 data URL 参考图由 Task 1 的真实冒烟测试决定；未获上游接受前不进入集成任务，也不会以图床规避该限制。
- **参考项目：** 已克隆 `references/autofigure-edit`（忽略目录）并只借鉴其兼容解析 `data[0].url` / `data[0].b64_json` 的小型模式；不引入其依赖或应用架构。
