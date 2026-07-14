# 微信公众号草稿同步实施计划

> **供执行型 Agent 使用：** 实施本计划必须逐任务执行；每个任务完成后运行列出的验证命令并提交。实施时使用 `executing-plans` 流程，不得跳过测试。

**目标：** 在不暴露公众号密钥的前提下，将 VoiceNest 已整理的 Markdown 自动创建或更新到个人微信公众号草稿箱，并保留 Obsidian 作为独立同步目标。

**架构：** 新建一个独立 Cloudflare Worker，负责管理员鉴权后的 Markdown 渲染、微信 token 缓存、草稿创建和更新。Vercel PWA 只保存 Worker 地址与发布结果，在现有 ASR → LLM 流程完成后分别执行 Obsidian 与公众号两个目标。

**技术栈：** TypeScript、Cloudflare Workers、Workers KV、Cloudflare Access、Vitest、`markdown-it`、现有 React/Vite/Dexie。

## 全局约束

- 只支持单管理员和单公众号；不实现用户注册、多账号、CMS、正文图片、图床、自动正式发布或后台处理。
- `WECHAT_APP_SECRET`、`WECHAT_APP_ID`、默认封面 `media_id` 只能存在于 Worker Secret；不得放入 PWA 配置、源代码、日志或备份导出。
- 公众号仅接收 Worker 渲染的 HTML；客户端不得传入 HTML，Markdown 原始内容继续由 VoiceNest 和 Obsidian 保存。
- 草稿默认关闭留言，所有草稿使用同一个手动上传的永久封面素材。
- Worker API 必须由 Cloudflare Access 限制为管理员；CORS 仅允许 `https://obvoice.lucc.fun`，不能将 CORS 当作鉴权。
- Worker 出站网段须先经 `POST /connection-test` 验证后再录入公众号 IP 白名单；此项目不实现固定 IP 服务。
- 自动处理仅在 PWA 前台且在线时运行，沿用现有 `useProcessor` 行为。

---

## 文件结构与职责

| 路径 | 职责 |
| --- | --- |
| `workers/wechat-draft/package.json` | 独立 Worker 的脚本和依赖。 |
| `workers/wechat-draft/wrangler.jsonc` | Worker 入口、KV 绑定和允许来源；不写入秘密。 |
| `workers/wechat-draft/src/types.ts` | Worker 环境、请求、响应和微信图文类型。 |
| `workers/wechat-draft/src/markdown.ts` | 禁用原始 HTML 的 Markdown 到微信内联 HTML 渲染。 |
| `workers/wechat-draft/src/wechat.ts` | 微信 token、草稿创建/更新和错误归一化。 |
| `workers/wechat-draft/src/index.ts` | 路由、Access 后的 API、CORS、KV 幂等与安全响应。 |
| `workers/wechat-draft/src/*.test.ts` | 不使用真实密钥的 Worker 单元测试。 |
| `src/lib/wechat.ts` | PWA 到 Worker 的类型化请求和用户可读错误。 |
| `src/lib/wechat.test.ts` | PWA 公众号客户端测试。 |
| `src/lib/config-store.ts` | 公众号 Worker URL/开关和 Obsidian 启用状态的持久化。 |
| `src/domain/recording.ts` | 每条录音的公众号草稿结果字段。 |
| `src/hooks/use-processor.ts` | LLM 后分别执行同步目标，汇总而非短路失败。 |
| `src/pages/SettingsPage.tsx` | 公众号开关、Worker URL、Access 授权与连接测试。 |
| `src/components/RecordingCard.tsx`、`src/pages/RecordingDetailPage.tsx` | 显示公众号草稿状态并复用现有重新同步入口。 |
| `src/styles.css` | 仅为新增状态文字/按钮补充必要样式。 |

## 任务 1：建立可测试的 Worker 项目和安全 Markdown 渲染

**文件：**

- Create: `workers/wechat-draft/package.json`
- Create: `workers/wechat-draft/wrangler.jsonc`
- Create: `workers/wechat-draft/tsconfig.json`
- Create: `workers/wechat-draft/src/types.ts`
- Create: `workers/wechat-draft/src/markdown.ts`
- Create: `workers/wechat-draft/src/markdown.test.ts`
- Modify: `.gitignore`

**接口：**

- Produces: `renderWechatHtml(markdown: string): string`
- Produces: `DraftArticle`，字段为 `title`、`content`、`thumb_media_id`、`need_open_comment`、`only_fans_can_comment`。
- Consumes: 无。后续任务只能调用 `renderWechatHtml`，不得自行拼接客户端 HTML。

- [ ] **步骤 1：写入 Worker 配置与本地秘密忽略规则。**

  在 `workers/wechat-draft/package.json` 定义以下命令，并用独立 package 隔离 Worker 依赖：

  ```json
  {
    "private": true,
    "type": "module",
    "scripts": {
      "dev": "wrangler dev",
      "deploy": "wrangler deploy",
      "test": "vitest run",
      "check": "tsc --noEmit"
    },
    "dependencies": { "markdown-it": "^14.1.0" },
    "devDependencies": {
      "@types/markdown-it": "^14.1.2",
      "typescript": "^5.8.3",
      "vitest": "^4.1.10",
      "wrangler": "^4.67.0"
    }
  }
  ```

  在根 `.gitignore` 添加 `workers/wechat-draft/.dev.vars*`。在 `wrangler.jsonc` 只保留公开配置：

  ```jsonc
  {
    "name": "voicenest-wechat-draft",
    "main": "src/index.ts",
    "compatibility_date": "2026-07-15",
    "kv_namespaces": [{ "binding": "WECHAT_CACHE", "id": "" }],
    "vars": { "ALLOWED_ORIGIN": "https://obvoice.lucc.fun" }
  }
  ```

  部署前必须执行 `npx wrangler kv namespace create WECHAT_CACHE`，将命令输出的真实 namespace ID 写入空字符串；空 ID 不得部署。

- [ ] **步骤 2：为 Markdown 安全边界写失败测试。**

  在 `workers/wechat-draft/src/markdown.test.ts` 覆盖标题、列表和原始 HTML：

  ```ts
  import { describe, expect, it } from 'vitest'
  import { renderWechatHtml } from './markdown'

  describe('renderWechatHtml', () => {
    it('renders the supported markdown with inline styles', () => {
      const html = renderWechatHtml('# 今日感想\n\n- 第一条')
      expect(html).toContain('<h1 style=')
      expect(html).toContain('<li>第一条</li>')
    })

    it('escapes raw HTML instead of passing it to WeChat', () => {
      const html = renderWechatHtml('<script>alert(1)</script>')
      expect(html).not.toContain('<script>')
      expect(html).toContain('&lt;script&gt;')
    })
  })
  ```

- [ ] **步骤 3：运行测试，确认当前失败。**

  运行：`npm --prefix workers/wechat-draft test -- src/markdown.test.ts`
  预期：失败，提示无法解析 `./markdown`。

- [ ] **步骤 4：实现最小渲染器与共享类型。**

  `workers/wechat-draft/src/markdown.ts` 使用 `markdown-it` 的 `html: false`；只覆盖开放标签以输出固定微信内联样式：

  ```ts
  import MarkdownIt from 'markdown-it'

  const markdown = new MarkdownIt({ html: false, linkify: true })
  const blockStyles: Record<string, string> = {
    h1: 'font-size:24px;font-weight:700;line-height:1.5;margin:24px 0 16px;',
    h2: 'font-size:20px;font-weight:700;line-height:1.5;margin:20px 0 12px;',
    p: 'font-size:16px;line-height:1.85;margin:0 0 14px;color:#1f2329;',
    blockquote: 'margin:16px 0;padding:8px 14px;border-left:3px solid #576b95;color:#57606a;',
    pre: 'padding:12px;overflow:auto;background:#f6f8fa;border-radius:6px;'
  }

  for (const tag of Object.keys(blockStyles)) {
    markdown.renderer.rules[`${tag}_open`] = () => `<${tag} style="${blockStyles[tag]}">`
  }

  export function renderWechatHtml(source: string): string {
    return markdown.render(source.trim())
  }
  ```

  `src/types.ts` 定义 `Env`、`DraftRequest`、`DraftResponse` 和 `DraftArticle`；其中 `Env` 只声明 `WECHAT_CACHE`、`WECHAT_APP_ID`、`WECHAT_APP_SECRET`、`WECHAT_COVER_MEDIA_ID`、`ALLOWED_ORIGIN`。

- [ ] **步骤 5：运行渲染测试与类型检查。**

  运行：

  ```bash
  npm --prefix workers/wechat-draft install
  npm --prefix workers/wechat-draft test -- src/markdown.test.ts
  npm --prefix workers/wechat-draft run check
  ```

  预期：两个测试通过，TypeScript 无错误。

- [ ] **步骤 6：提交 Worker 基础。**

  ```bash
  git add .gitignore workers/wechat-draft
  git commit -m "feat: 建立公众号草稿 Worker 基础"
  codegraph sync
  ```

## 任务 2：实现微信 token、草稿 API 与 Worker 幂等路由

**文件：**

- Create: `workers/wechat-draft/src/wechat.ts`
- Create: `workers/wechat-draft/src/wechat.test.ts`
- Create: `workers/wechat-draft/src/index.ts`
- Create: `workers/wechat-draft/src/index.test.ts`
- Modify: `workers/wechat-draft/wrangler.jsonc`

**接口：**

- Consumes: `Env`、`DraftRequest`、`DraftArticle`、`renderWechatHtml`。
- Produces: `getAccessToken(env, fetchFn)`、`createDraft(env, article, fetchFn)`、`updateDraft(env, mediaId, article, fetchFn)`。
- Produces: `POST /connection-test` 和 `POST /drafts`；成功 JSON 为 `{ mediaId: string, reused: boolean }`。

- [ ] **步骤 1：为 token 缓存和草稿创建写失败测试。**

  在 `src/wechat.test.ts` 使用内存 KV 与 `fetchFn` mock，断言缓存命中时不请求 token、草稿载荷使用默认封面且关闭评论：

  ```ts
  it('creates a draft with the shared cover and closed comments', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'token', expires_in: 7200 }))
      .mockResolvedValueOnce(jsonResponse({ media_id: 'draft-1' }))
    const mediaId = await createDraft(env, article, fetchFn)
    expect(mediaId).toBe('draft-1')
    expect(fetchFn.mock.calls[1][0]).toContain('/cgi-bin/draft/add?access_token=token')
    expect(JSON.parse(fetchFn.mock.calls[1][1].body).articles[0]).toMatchObject({
      thumb_media_id: 'cover-media-id',
      need_open_comment: 0,
      only_fans_can_comment: 0
    })
  })
  ```

- [ ] **步骤 2：为幂等和白名单错误写失败路由测试。**

  在 `src/index.test.ts` 调用 Worker `fetch` handler：同一个 `requestId` 第二次请求必须返回第一次保存的 `mediaId` 且不调用草稿接口；微信 `40164` 必须返回 HTTP 422 和 `code: "WECHAT_IP_NOT_ALLOWED"`。

  ```ts
  expect(response.status).toBe(422)
  await expect(response.json()).resolves.toMatchObject({ code: 'WECHAT_IP_NOT_ALLOWED' })
  ```

- [ ] **步骤 3：运行 Worker 测试，确认失败。**

  运行：`npm --prefix workers/wechat-draft test -- src/wechat.test.ts src/index.test.ts`
  预期：失败，提示 `createDraft` 和 Worker handler 尚未导出。

- [ ] **步骤 4：实现微信服务。**

  `getAccessToken` 使用 KV key `wechat:token` 保存 `{ token, expiresAt }`，仅当 `expiresAt > Date.now() + 300_000` 时复用；否则请求：

  ```ts
  const url = new URL('https://api.weixin.qq.com/cgi-bin/token')
  url.searchParams.set('grant_type', 'client_credential')
  url.searchParams.set('appid', env.WECHAT_APP_ID)
  url.searchParams.set('secret', env.WECHAT_APP_SECRET)
  ```

  `createDraft` 调用 `/cgi-bin/draft/add`，请求体固定为：

  ```ts
  {
    articles: [{
      title: article.title,
      content: article.content,
      thumb_media_id: env.WECHAT_COVER_MEDIA_ID,
      need_open_comment: 0,
      only_fans_can_comment: 0
    }]
  }
  ```

  `updateDraft` 调用 `/cgi-bin/draft/update`，请求体为 `{ media_id: mediaId, index: 0, articles: article }`。所有微信响应先解析 JSON；非零 `errcode` 抛出包含 `errcode` 和 `errmsg` 的 `WechatApiError`，但错误对象不得包含 token 或 Secret。

- [ ] **步骤 5：实现路由和 KV 幂等记录。**

  在 `src/index.ts`：

  - 只接受 `POST /connection-test` 与 `POST /drafts`，其余返回 404。
  - `OPTIONS` 返回 `Access-Control-Allow-Origin: env.ALLOWED_ORIGIN`、`Access-Control-Allow-Methods: POST, OPTIONS` 与 `Vary: Origin`；非允许来源的实际请求返回 403。
  - `/connection-test` 仅调用 `getAccessToken`，成功返回 `{ ok: true }`。
  - `/drafts` 校验非空 `recordingId`、`requestId`、`title`、`markdown`，并限制标题为 64 个 Unicode 码点；渲染后限制 HTML 少于 20,000 个字符且 UTF-8 字节数小于 1MB；无效请求返回 400。
  - 以 `draft-request:${requestId}` 查 KV。存在时直接返回其 `{ mediaId }` 和 `reused: true`。
  - 无 `draftMediaId` 时调用 `createDraft`；有值时调用 `updateDraft`。成功后以 7 天 TTL 保存 `{ mediaId }`，再返回 `{ mediaId, reused: false }`。
  - 映射 `40164` 为 HTTP 422/`WECHAT_IP_NOT_ALLOWED`；其余微信错误为 HTTP 502/`WECHAT_API_ERROR`。

- [ ] **步骤 6：运行 Worker 测试、构建并进行本地手动检查。**

  运行：

  ```bash
  npm --prefix workers/wechat-draft test
  npm --prefix workers/wechat-draft run check
  npm --prefix workers/wechat-draft run dev
  ```

  预期：自动化测试全绿；本地 `wrangler dev` 能启动。手动 `POST /connection-test` 时若 `.dev.vars` 未配置，应返回安全错误且响应中不出现密钥。

- [ ] **步骤 7：提交 Worker API。**

  ```bash
  git add workers/wechat-draft
  git commit -m "feat: 支持公众号草稿 Worker 接口"
  codegraph sync
  ```

## 任务 3：增加 PWA 公众号配置、草稿状态和 Worker 客户端

**文件：**

- Create: `src/lib/wechat.ts`
- Create: `src/lib/wechat.test.ts`
- Modify: `src/lib/config-store.ts`
- Modify: `src/domain/recording.ts`
- Modify: `src/lib/recording-db.test.ts`

**接口：**

- Produces: `WechatDraftConfig`：`{ enabled: boolean; workerUrl: string }`。
- Produces: `WechatDraftRequest`：`{ recordingId: string; requestId: string; title: string; markdown: string; draftMediaId?: string }`。
- Produces: `publishWechatDraft(config, request): Promise<{ mediaId: string; reused: boolean }>`。
- Produces: `testWechatConnection(config): Promise<void>`。
- Produces: `WechatDraftStatus`（定义在 `src/domain/recording.ts`）：`'idle' | 'syncing' | 'drafted' | 'failed' | 'authorization_required'`。

- [ ] **步骤 1：为 PWA Worker 客户端写失败测试。**

  在 `src/lib/wechat.test.ts` mock `fetch`，覆盖正确地址、携带凭据和白名单错误：

  ```ts
  it('posts markdown to the configured worker with same-site credentials', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ mediaId: 'draft-1', reused: false }))
    await publishWechatDraft({ enabled: true, workerUrl: 'https://wechat-api.lucc.fun' }, request)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://wechat-api.lucc.fun/drafts',
      expect.objectContaining({ method: 'POST', credentials: 'include' })
    )
  })

  it('turns a 401 Access response into an authorization error', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 401 }))
    await expect(testWechatConnection(config)).rejects.toThrow('公众号发布授权已过期')
  })
  ```

- [ ] **步骤 2：运行测试，确认失败。**

  运行：`npm test -- src/lib/wechat.test.ts`
  预期：失败，提示模块不存在。

- [ ] **步骤 3：实现客户端与配置。**

  `src/lib/wechat.ts` 使用 `workerUrl.replace(/\/+$/, '')` 构造 `/drafts` 与 `/connection-test`，始终设置 `credentials: 'include'`、`Content-Type: application/json`。HTTP 401/403 抛出“公众号发布授权已过期，请重新授权”；`WECHAT_IP_NOT_ALLOWED` 抛出“公众号 IP 白名单未配置，请先运行连接测试”。

  在 `config-store.ts` 增加：

  ```ts
  export interface WechatDraftConfig {
    enabled: boolean
    workerUrl: string
  }

  export function getWechatDraftConfig(): WechatDraftConfig {
    const data = localStorage.getItem('vn_wechat_draft')
    return data ? JSON.parse(data) : { enabled: false, workerUrl: '' }
  }

  export function saveWechatDraftConfig(config: WechatDraftConfig): void {
    localStorage.setItem('vn_wechat_draft', JSON.stringify(config))
  }
  ```

  在 `src/domain/recording.ts` 定义 `WechatDraftStatus`，并在 `Recording` 增加可选字段：

  ```ts
  wechatStatus?: WechatDraftStatus
  wechatDraftMediaId?: string
  wechatErrorMessage?: string
  wechatRequestId?: string
  ```

  `recording-db.test.ts` 增加保存并读回上述四个字段的断言，确认 Dexie schema 不需要新增索引或迁移。

- [ ] **步骤 4：运行 PWA 单测与构建。**

  运行：

  ```bash
  npm test -- src/lib/wechat.test.ts src/lib/recording-db.test.ts
  npm run build
  ```

  预期：测试通过，生产构建不包含任何 `WECHAT_APP_SECRET` 字符串或配置字段。

- [ ] **步骤 5：提交 PWA 配置和客户端。**

  ```bash
  git add src/lib/wechat.ts src/lib/wechat.test.ts src/lib/config-store.ts src/domain/recording.ts src/lib/recording-db.test.ts
  git commit -m "feat: 增加公众号草稿同步配置"
  codegraph sync
  ```

## 任务 4：把公众号作为独立同步目标接入处理流水线

**文件：**

- Modify: `src/hooks/use-processor.ts`
- Modify: `src/lib/sync.ts`
- Create: `src/lib/sync-targets.ts`
- Create: `src/lib/sync-targets.test.ts`

**接口：**

- Consumes: `publishWechatDraft`、`getWechatDraftConfig`、`Recording` 的公众号字段和现有 `syncToObsidian`。
- Produces: `syncProcessedNote(input, dependencies)`，一次调用尝试全部已启用目标并返回每个目标的独立结果。

- [ ] **步骤 1：先为“独立目标不短路”写失败测试。**

  在 `src/lib/sync-targets.test.ts` 为尚不存在的 `syncProcessedNote` 注入 mock 依赖；断言 Obsidian 抛错时公众号仍被调用，且结果分别保留：

  ```ts
  const result = await syncProcessedNote(input, {
    syncToObsidian: vi.fn().mockRejectedValue(new Error('Obsidian unavailable')),
    publishWechatDraft: vi.fn().mockResolvedValue({ mediaId: 'draft-1', reused: false })
  })

  expect(result.obsidian).toMatchObject({ ok: false, error: 'Obsidian unavailable' })
  expect(result.wechat).toMatchObject({ ok: true, mediaId: 'draft-1' })
  ```

- [ ] **步骤 2：运行测试，确认现有 `useProcessor` 的 Obsidian 失败提前 `return` 导致失败。**

  运行：`npm test -- src/lib/sync-targets.test.ts`
  预期：失败，提示无法解析 `./sync-targets`。

- [ ] **步骤 3：最小化重构同步尾段。**

  新建 `src/lib/sync-targets.ts`，定义以下输入、依赖和返回类型：

  ```ts
  export interface SyncProcessedNoteInput {
    recordingId: string
    title: string
    markdown: string
    obsidianDir: string
    obsidianConfig: SyncConfig
    wechatConfig: WechatDraftConfig
    wechatRequestId?: string
    wechatDraftMediaId?: string
  }

  export interface SyncTargetResult {
    ok: boolean
    error?: string
    mediaId?: string
    authorizationRequired?: boolean
  }
  ```

  `syncProcessedNote` 仅调用每个已启用目标并捕获各自错误；它不读写 Dexie。Obsidian 仅在 `isObsidianConfigured` 为真时调用。公众号仅在 `wechatConfig.enabled` 为真时调用，并要求调用方提供已持久化的 `wechatRequestId`。返回 `{ obsidian?: SyncTargetResult, wechat?: SyncTargetResult }`。

  在 `use-processor.ts` 的 LLM 成功后：

  1. 先写入 `localTitle` 和 `summary`。
  2. 当 `getWechatDraftConfig().enabled` 为真时，先生成并持久化 `crypto.randomUUID()` 到 `wechatRequestId`，状态置为 `syncing`。
  3. 调用 `syncProcessedNote`；不再在 Obsidian catch 中 `return`。调用时传入已经持久化的 `wechatRequestId`：

     ```ts
     const results = await syncProcessedNote({
       recordingId: id,
       title: formatted.title,
       markdown: formatted.markdown,
       obsidianDir: currentType.obsidianPath,
       obsidianConfig: getSyncConfig(),
       wechatConfig: getWechatDraftConfig(),
       wechatRequestId: requestId,
       wechatDraftMediaId: rec.wechatDraftMediaId
     })
     ```

  4. 根据 `syncProcessedNote` 的 `wechat` 结果持久化 `wechatStatus: 'drafted'`、`wechatDraftMediaId` 或 `authorization_required`/`failed` 和中文错误；已成功的字段不得回滚。
  5. 所有已启用目标成功时才设总状态 `synced` 并执行现有音频清理；任一目标失败时设总状态 `failed`，错误文案由各失败 `error` 以 `；` 连接。
  6. `sync_only` 使用已有 `summary` 与 `localTitle` 重跑 `syncProcessedNote`；它对已有 `wechatDraftMediaId` 使用更新 API，不重新运行 ASR/LLM。

  为避免把默认 `http://localhost:8080` 当作已启用目标，在 `sync.ts` 增加并使用：

  ```ts
  export function isObsidianConfigured(config: SyncConfig): boolean {
    return Boolean(config.apiToken.trim() && config.vault.trim())
  }
  ```

  没有配置 Obsidian 时跳过它；已有用户填写 token 与 vault 后行为不变。

- [ ] **步骤 4：运行同步相关测试与完整测试套件。**

  运行：

  ```bash
  npm test -- src/lib/sync-targets.test.ts src/lib/wechat.test.ts src/lib/recording-db.test.ts
  npm test
  npm run build
  ```

  预期：全绿；在本地 fake IndexedDB 中可观察到 `wechatStatus` 与 `wechatDraftMediaId` 被持久化。

- [ ] **步骤 5：提交处理流水线。**

  ```bash
  git add src/hooks/use-processor.ts src/lib/sync.ts src/lib/sync-targets.ts src/lib/sync-targets.test.ts
  git commit -m "feat: 自动同步公众号草稿"
  codegraph sync
  ```

## 任务 5：配置与状态 UI、真实部署和验收

**文件：**

- Modify: `src/pages/SettingsPage.tsx`
- Modify: `src/pages/RecordingDetailPage.tsx`
- Modify: `src/components/RecordingCard.tsx`
- Modify: `src/styles.css`
- Modify: `.trellis/tasks/07-12-stage2-processing/prd.md`

**接口：**

- Consumes: `getWechatDraftConfig`、`saveWechatDraftConfig`、`testWechatConnection`、`WechatDraftStatus`。
- Produces: 管理员可配置 Worker、完成 Access 授权、测试连接、理解每条录音草稿状态并调用既有重新同步。

- [ ] **步骤 1：为公众号状态文案写失败测试。**

  不引入 React Testing Library。为尚不存在的 `getWechatStatusLabel` 在 `src/lib/wechat.test.ts` 增加纯函数测试：

  ```ts
  expect(getWechatStatusLabel('drafted')).toBe('公众号草稿已创建')
  expect(getWechatStatusLabel('authorization_required')).toBe('公众号发布授权已过期')
  ```

- [ ] **步骤 2：运行该测试，确认失败。**

  运行：`npm test -- src/lib/wechat.test.ts`
  预期：失败，提示 `getWechatStatusLabel` 尚未导出。

- [ ] **步骤 3：实现最小设置与状态展示。**

  在 `SettingsPage.tsx` 新增一个可折叠“公众号草稿同步”区块，包含：启用开关、Worker URL 输入、`window.open(workerUrl, '_blank', 'noopener,noreferrer')` 的“登录发布服务”按钮、以及调用 `testWechatConnection` 的“测试连接”按钮。保存时仅调用 `saveWechatDraftConfig`；页面、备份导出与导入中都不得出现 AppID 或 AppSecret 字段。

  在 `src/lib/wechat.ts` 实现 `getWechatStatusLabel(status)`，只映射 `syncing`、`drafted`、`authorization_required`、`failed`；未设置状态返回 `undefined`。在 `RecordingCard.tsx` 和 `RecordingDetailPage.tsx` 调用该函数显示以下纯文本状态：

  | 状态 | 文案 |
  | --- | --- |
  | `syncing` | `公众号草稿同步中` |
  | `drafted` | `公众号草稿已创建` |
  | `authorization_required` | `公众号发布授权已过期` |
  | `failed` | `公众号草稿同步失败` |

  复用当前“重新同步”动作；不增加“正式发布”或“创建新草稿”按钮。新增样式仅使用现有状态色与小号辅助文字，不能破坏卡片操作按钮的一行布局。

- [ ] **步骤 4：配置 Cloudflare 与公众号真实环境。**

  执行以下部署前操作：

  ```bash
  cd workers/wechat-draft
  npx wrangler login
  npx wrangler kv namespace create WECHAT_CACHE
  npx wrangler secret put WECHAT_APP_ID
  npx wrangler secret put WECHAT_APP_SECRET
  npx wrangler secret put WECHAT_COVER_MEDIA_ID
  npm run deploy
  ```

  在 Cloudflare 为 Worker 自定义域名配置 Access，仅允许管理员邮箱；将该域名填入 VoiceNest 设置页。先登录发布服务，再运行“测试连接”。若返回 `WECHAT_IP_NOT_ALLOWED`，按公众号后台提示增加经验证的 Cloudflare 出站网段，再重复测试直到成功。

- [ ] **步骤 5：运行完整自动化检查。**

  运行：

  ```bash
  npm test
  npm run build
  npm --prefix workers/wechat-draft test
  npm --prefix workers/wechat-draft run check
  git diff --check
  ```

  预期：全部成功，且 `git status --short` 除用户既有的 `.DS_Store` 文件外不包含意外生成物。

- [ ] **步骤 6：执行真机验收。**

  在 Android Chrome 或 iPhone Safari 完成一段录音，等待 ASR/LLM 完成，并确认：

  1. 公众号后台草稿箱新增或更新同一篇草稿，标题、默认封面、内联排版正确，且没有自动群发。
  2. 修改详情页 Markdown 后点击“重新同步”，草稿数量不增加且内容更新。
  3. 关闭网络、退出 Access、移除白名单分别得到可操作的中文错误。
  4. Obsidian 与公众号其中之一失败时，另一个成功结果仍保留并可见。

- [ ] **步骤 7：更新需求记录并提交 UI 与验收。**

  将公众号草稿同步列入 `.trellis/tasks/07-12-stage2-processing/prd.md` 的已确认需求、验收与非范围，然后：

  ```bash
  git add src/pages/SettingsPage.tsx src/pages/RecordingDetailPage.tsx src/components/RecordingCard.tsx src/styles.css .trellis/tasks/07-12-stage2-processing/prd.md
  git commit -m "feat: 展示公众号草稿同步状态"
  codegraph sync
  ```

## 计划自检

- 规格中的单管理员、秘密隔离、Access、IP 白名单、默认封面、Markdown 渲染、草稿创建/更新、独立 Obsidian 结果、前台自动处理与明确非范围均映射到任务 1–5。
- 没有自动正式发布、正文图片或博客相关任务。
- 后续任务使用的 `WechatDraftConfig`、`WechatDraftStatus`、`DraftRequest`、`publishWechatDraft` 和 Worker 路由均在前序任务中定义。
- 所有网络行为都有 mock 单元测试；真实微信公众号操作只在最终手动验收中使用管理员密钥。
