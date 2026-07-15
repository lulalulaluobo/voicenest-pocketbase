# 公众号阅读排版、原文改写与预览实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标：** 将公众号文章改写源切换至 ASR 原文，把模板编辑集中到设置页，并提供与实际草稿一致的阅读排版预览。

**架构：** Cloudflare Worker 保持唯一的 Markdown → HTML 渲染边界，扩展完整公众号阅读样式和只渲染的 `/preview` 端点。PWA 只传标题与 Markdown 获取预览，编辑页按设置页模板将 `transcript` 改写后再手动发布；不在客户端渲染或保存 HTML。

**技术栈：** TypeScript、markdown-it、Cloudflare Workers、React、Dexie、Vitest、现有 Cloudflare Access 与 Vercel。

## 已调研参考

- `references/doocs-md`：其微信 Markdown 设计说明了必须把列表、引用、代码块等所有块级元素纳入一套样式。本次只借鉴这一原则，继续使用当前 `markdown-it`，不引入其 Vue 编辑器或依赖。
- `references/wechat-publisher`：现有 Worker 已沿用其草稿创建/更新边界。本次 `/preview` 仅复用渲染，不能调用任何微信接口。

## 全局约束

- `transcript` 是公众号二次改写唯一来源；为空时禁止改写，不得回退 `summary`。
- `summary` 仍仅为个人笔记，`wechatTitle`/`wechatMarkdown` 仍仅为公众号文章。
- HTML 只由 Worker 的 `renderWechatHtml` 生成，`markdown-it` 必须保持 `html: false`。
- `/preview` 与 `/drafts` 使用相同 Access、允许来源、请求长度限制和中文错误格式；`/preview` 不读写 KV、不请求微信 API、不改变草稿状态。
- 不新增富文本编辑器、主题切换、图片图床、自动发布或草稿列表；不增加依赖。

---

### 任务 1：完善 Worker 阅读排版并提供安全预览接口

**文件：**

- Modify: `workers/wechat-draft/src/markdown.ts`
- Modify: `workers/wechat-draft/src/markdown.test.ts`
- Modify: `workers/wechat-draft/src/index.ts`
- Modify: `workers/wechat-draft/src/index.test.ts`

**接口：**

- Produces: `renderWechatHtml(source: string): string`，输出带内联公众号阅读样式的安全 HTML。
- Produces: `POST /preview`，请求 `{ title: string; markdown: string }`，成功响应 `{ title: string; html: string }`。
- Consumes: `Env.ALLOWED_ORIGIN`、既有 `json` 与 `renderWechatHtml`；不得调用 `getAccessToken`、`createDraft` 或 `updateDraft`。

- [ ] **步骤 1：为阅读样式补写失败测试。**

  在 `workers/wechat-draft/src/markdown.test.ts` 新增测试，覆盖标题、无序/有序列表、引用、分割线、链接和原始 HTML：

  ```ts
  it('renders every reading block with WeChat-friendly inline styles', () => {
    const html = renderWechatHtml('# 标题\n\n## 小节\n\n- 项目\n- 第二项\n\n1. 第一步\n\n> 引用\n\n---\n\n[链接](https://example.com)')

    expect(html).toContain('<ul style=')
    expect(html).toContain('<ol style=')
    expect(html).toContain('<li style=')
    expect(html).toContain('<blockquote style=')
    expect(html).toContain('<hr style=')
    expect(html).toContain('<a href="https://example.com" style=')
  })
  ```

- [ ] **步骤 2：运行 Markdown 测试并确认失败。**

  运行：

  ```bash
  npm --prefix workers/wechat-draft test -- src/markdown.test.ts
  ```

  预期：新测试因 `ul`、`ol`、`li`、`hr` 或 `a` 没有内联样式而失败。

- [ ] **步骤 3：实现最小完整的块级与行内样式。**

  在 `markdown.ts` 保留 `html: false`，新增以下样式并覆盖对应 renderer rule；所有样式使用内联字符串，不依赖 CSS class：

  ```ts
  const blockStyles = {
    h1: 'margin:0 0 28px;font-size:24px;line-height:1.45;font-weight:700;color:#1f2329;',
    h2: 'margin:34px 0 16px;padding-left:10px;border-left:4px solid #07c160;font-size:20px;line-height:1.5;font-weight:700;color:#1f2329;',
    h3: 'margin:26px 0 12px;font-size:17px;line-height:1.6;font-weight:700;color:#1f2329;',
    p: 'margin:0 0 18px;font-size:16px;line-height:1.9;color:#2c2c2c;letter-spacing:0.02em;',
    ul: 'margin:0 0 18px;padding-left:1.5em;',
    ol: 'margin:0 0 18px;padding-left:1.6em;',
    li: 'margin:0 0 8px;font-size:16px;line-height:1.85;color:#2c2c2c;',
    blockquote: 'margin:20px 0;padding:12px 16px;border-left:4px solid #07c160;background:#f6fbf7;color:#57606a;',
    hr: 'margin:30px 0;border:0;border-top:1px solid #e7e7e7;',
    pre: 'margin:20px 0;padding:14px;overflow:auto;border-radius:6px;background:#f6f8fa;',
  }
  const linkStyle = 'color:#576b95;text-decoration:underline;'
  ```

  使用 `list_item_open`、`bullet_list_open`、`ordered_list_open`、`hr` 和 `link_open` rules 输出样式；`link_open` 必须保留 markdown-it 已验证后的 `href` 属性。不要手工解析 Markdown，也不要改变现有标题、段落、引用、代码块的转义逻辑。

- [ ] **步骤 4：为 `/preview` 写失败路由测试。**

  在 `workers/wechat-draft/src/index.test.ts` 增加请求助手和测试：

  ```ts
  function previewRequest(): Request {
    return new Request('https://wechat-api.lucc.fun/preview', {
      method: 'POST',
      headers: { Origin: 'https://obvoice.lucc.fun', 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '预览标题', markdown: '## 小节\n\n正文' })
    })
  }

  it('renders preview without requesting WeChat or changing drafts', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const response = await worker.fetch(previewRequest(), createEnv())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ title: '预览标题', html: expect.stringContaining('<h2 style=') })
    expect(fetchMock).not.toHaveBeenCalled()
  })
  ```

- [ ] **步骤 5：实现预览请求验证与路由。**

  在 `index.ts` 增加局部类型和验证函数：

  ```ts
  interface PreviewRequest { title: string; markdown: string }

  function validatePreview(input: unknown, env: Env): PreviewRequest | Response {
    if (!input || typeof input !== 'object') return json({ code: 'INVALID_REQUEST', message: '请求格式无效' }, 400, env.ALLOWED_ORIGIN)
    const request = input as Partial<PreviewRequest>
    if (!request.title?.trim() || !request.markdown?.trim()) return json({ code: 'INVALID_REQUEST', message: '标题和正文不能为空' }, 400, env.ALLOWED_ORIGIN)
    if ([...request.title].length > 64) return json({ code: 'INVALID_REQUEST', message: '公众号标题不能超过 64 个字符' }, 400, env.ALLOWED_ORIGIN)
    return { title: request.title.trim(), markdown: request.markdown }
  }
  ```

  `handlePreview` 调用 `renderWechatHtml`，复用 `makeArticle` 的 HTML 长度限制（可提取仅检查 HTML 的小函数，`makeArticle` 与预览共用）；成功返回 `{ title, html }`。在 fetch handler 的 `/drafts` 判断前增加：

  ```ts
  if (request.method === 'POST' && url.pathname === '/preview') return await handlePreview(request, env)
  ```

- [ ] **步骤 6：运行 Worker 测试、类型检查并提交。**

  ```bash
  npm --prefix workers/wechat-draft test
  npm --prefix workers/wechat-draft run check
  git add workers/wechat-draft/src/markdown.ts workers/wechat-draft/src/markdown.test.ts workers/wechat-draft/src/index.ts workers/wechat-draft/src/index.test.ts
  git commit -m "feat: 支持公众号排版预览"
  codegraph sync
  ```

  预期：Worker 测试全部通过；预览不发生任何微信 API 调用。

### 任务 2：增加 PWA 预览客户端与 ASR 原文改写守卫

**文件：**

- Modify: `src/lib/wechat.ts`
- Modify: `src/lib/wechat.test.ts`
- Modify: `src/lib/api-clients.test.ts`

**接口：**

- Produces: `previewWechatDraft(config: WechatDraftConfig, article: { title: string; markdown: string }): Promise<{ title: string; html: string }>`。
- Consumes: 已有 `workerBaseUrl`、`readError`、`WechatDraftError`。
- Verifies: `rewriteWechatArticle` 的输入由编辑页传入 `transcript`，而不是 `summary`。

- [ ] **步骤 1：添加预览客户端失败测试。**

  在 `src/lib/wechat.test.ts` 增加：

  ```ts
  it('posts article markdown to the preview endpoint', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(new Response(JSON.stringify({ title: '标题', html: '<p>正文</p>' })))

    await expect(previewWechatDraft(config, { title: '标题', markdown: '正文' })).resolves.toEqual({ title: '标题', html: '<p>正文</p>' })
    expect(globalThis.fetch).toHaveBeenCalledWith('https://wechat-api.lucc.fun/preview', expect.objectContaining({ method: 'POST', credentials: 'include' }))
  })
  ```

- [ ] **步骤 2：运行测试并确认失败。**

  ```bash
  npm test -- src/lib/wechat.test.ts
  ```

  预期：失败，提示 `previewWechatDraft` 尚未导出。

- [ ] **步骤 3：实现最小预览客户端。**

  在 `src/lib/wechat.ts` 增加：

  ```ts
  export interface WechatPreviewResult { title: string; html: string }

  export async function previewWechatDraft(config: WechatDraftConfig, article: Pick<WechatDraftRequest, 'title' | 'markdown'>): Promise<WechatPreviewResult> {
    const response = await fetch(`${workerBaseUrl(config)}/preview`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(article)
    })
    if (!response.ok) throw await readError(response)
    const data = await response.json() as Partial<WechatPreviewResult>
    if (typeof data.title !== 'string' || typeof data.html !== 'string') throw new WechatDraftError('公众号预览服务返回的数据无效', 'api')
    return { title: data.title, html: data.html }
  }
  ```

- [ ] **步骤 4：调整现有 LLM 测试的输入断言。**

  在 `src/lib/api-clients.test.ts` 保留 `rewriteWechatArticle` 的客户端请求测试；该函数不接触记录字段。编辑页的实际调用将在任务 3 由 TypeScript 构建和手动验证覆盖，不在该纯函数测试中伪造 Dexie。

- [ ] **步骤 5：运行客户端测试并提交。**

  ```bash
  npm test -- src/lib/wechat.test.ts src/lib/api-clients.test.ts
  git add src/lib/wechat.ts src/lib/wechat.test.ts src/lib/api-clients.test.ts
  git commit -m "feat: 增加公众号排版预览客户端"
  codegraph sync
  ```

  预期：预览请求使用 Access cookie，错误与草稿发布保持一致。

### 任务 3：将模板编辑移至设置页，并以 ASR 原文改写

**文件：**

- Modify: `src/pages/SettingsPage.tsx`
- Modify: `src/pages/WechatEditorPage.tsx`
- Modify: `src/lib/wechat.test.ts`

**接口：**

- Consumes: `getWechatPromptTemplates()`、`saveWechatPromptTemplates()`、`rewriteWechatArticle(transcript, prompt, llmConfig)`、`previewWechatDraft()`。
- Produces: 设置页模板编辑 UI；编辑页只有模板 select 与预览 modal，不再保存模板 prompt。

- [ ] **步骤 1：为模板持久化补充一次编辑测试。**

  在 `src/lib/wechat.test.ts` 的既有模板测试中，增加“保存三个模板数组后，读取结果保留每个 `id`、`name`、`prompt`”断言；该测试必须使用现有 localStorage mock。

- [ ] **步骤 2：运行测试并确认当前存储行为已通过。**

  ```bash
  npm test -- src/lib/wechat.test.ts
  ```

  预期：通过；该测试锁定设置页将复用的已有存储 API，而不新增第二份模板数据。

- [ ] **步骤 3：在设置页加入模板编辑区。**

  在 `SettingsPage` 初始化：

  ```ts
  const [wechatPromptTemplates, setWechatPromptTemplates] = useState(getWechatPromptTemplates())
  ```

  在公众号折叠区域、服务说明后渲染固定模板编辑列表：

  ```tsx
  {wechatPromptTemplates.map((template) => (
    <div key={template.id} style={{ display: 'grid', gap: '4px' }}>
      <label style={{ fontSize: '12px', fontWeight: 'bold' }}>{template.name}</label>
      <textarea value={template.prompt} onChange={(event) => {
        const next = wechatPromptTemplates.map((item) => item.id === template.id ? { ...item, prompt: event.target.value } : item)
        setWechatPromptTemplates(next)
        saveWechatPromptTemplates(next)
      }} style={{ minHeight: '88px' }} />
    </div>
  ))}
  ```

  不提供新增、删除或排序功能，保持三个固定模板。

- [ ] **步骤 4：简化编辑页为 ASR 原文与筛选。**

  在 `WechatEditorPage`：

  - 删除 `prompt` state、`savePrompt`、`saveWechatPromptTemplates` import 和提示词 textarea；
  - template select 的改变只更新 `templateId`；
  - 从 `templates.find(...)` 获得 `selectedTemplate`；
  - `handleRewrite` 的守卫与调用必须为：

    ```ts
    if (!recording?.transcript || !selectedTemplate?.prompt.trim()) {
      setMessage('请先重新转写，再生成公众号文章。')
      return
    }
    const article = await rewriteWechatArticle(recording.transcript, selectedTemplate.prompt.trim(), getLLMConfig())
    ```

  - 参考区显示 `recording.transcript`，标题为“ASR 原文参考”；无原文时显示说明，生成按钮 disabled。

- [ ] **步骤 5：加入预览弹窗。**

  在编辑页增加 `previewHtml`、`isPreviewing` 状态和按钮。预览处理函数仅调用 `previewWechatDraft(config, { title: title.trim(), markdown: markdown.trim() })`，成功时写 `previewHtml`；失败时写当前 `message`。渲染：

  ```tsx
  {previewHtml && (
    <div role="dialog" aria-modal="true" className="preview-modal">
      <div className="preview-modal-card">
        <button className="icon-btn" onClick={() => setPreviewHtml('')} aria-label="关闭预览">×</button>
        <iframe title="公众号排版预览" sandbox="" srcDoc={`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:24px 20px;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif;">${previewHtml}</body></html>`} />
      </div>
    </div>
  )}
  ```

  “预览排版”在标题/正文为空时禁用；关闭不写录音、不给 Worker 发草稿请求。发布按钮保留，仍需用户明确点击。

- [ ] **步骤 6：补充最小 CSS 并运行前端验证。**

  在 `src/styles.css` 添加 `.preview-modal`（fixed 遮罩、居中、z-index 高于 BottomNav）、`.preview-modal-card`（最大宽度、最大高度）与其 iframe（100% 宽高、无边框），不改动现有页面样式。运行：

  ```bash
  npm test
  npm run build
  ```

  预期：测试与 TypeScript 构建通过；编辑页不再出现提示词 textarea，且缺少 ASR 原文时无法生成。

- [ ] **步骤 7：提交前端交互。**

  ```bash
  git add src/pages/SettingsPage.tsx src/pages/WechatEditorPage.tsx src/styles.css src/lib/wechat.test.ts
  git commit -m "feat: 使用原文改写并支持排版预览"
  codegraph sync
  ```

### 任务 4：回归、部署与设备验收

**文件：**

- Modify: `.trellis/tasks/07-12-stage2-processing/check.jsonl`

- [ ] **步骤 1：运行完整验证。**

  ```bash
  npm --prefix workers/wechat-draft test
  npm --prefix workers/wechat-draft run check
  npm test
  npm run build
  ```

  预期：Worker 与 PWA 测试、类型检查、构建均退出码 0。

- [ ] **步骤 2：部署 Worker。**

  ```bash
  npx --prefix workers/wechat-draft wrangler deploy
  ```

  预期：`wechat-api.lucc.fun` 的新 Worker 版本部署成功；不修改 Secret、KV 或 Access 配置。

- [ ] **步骤 3：部署 Vercel 并更新自定义域名。**

  ```bash
  DEPLOYMENT_URL="$(npx vercel --prod --yes | sed -n 's/^Production[[:space:]]*//p' | tail -n 1)"
  npx vercel alias set "$DEPLOYMENT_URL" obvoice.lucc.fun
  npx vercel inspect https://obvoice.lucc.fun
  ```

  预期：生产部署 Ready，`obvoice.lucc.fun` 指向本次部署。

- [ ] **步骤 4：在手机 PWA 验收。**

  1. 在设置编辑一个模板，刷新页面确认内容仍保留。
  2. 打开有 ASR 原文的录音，确认参考区显示 ASR 原文；选择模板，生成公众号文章。
  3. 点击“预览排版”，确认标题、段落、两类列表、引用、分隔线和链接均正常；关闭后修改正文，重新预览。
  4. 对没有 ASR 原文的旧录音，确认提示重新转写且无法生成。
  5. 点击“发布到草稿箱”，确认预览没有创建草稿而显式发布才创建/更新草稿。

- [ ] **步骤 5：记录验证并提交。**

  将命令结果、Worker 版本、Vercel 部署 URL 与设备验收结论（不记录 token、Secret 或正文）追加到 `check.jsonl`，然后：

  ```bash
  git add .trellis/tasks/07-12-stage2-processing/check.jsonl
  git commit -m "docs: 记录公众号排版预览验证"
  codegraph sync
  ```
