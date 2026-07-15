# 公众号人工二次改写实施计划

> **实施要求：** 按任务顺序以内联方式执行；每项先写或调整对应测试，再实现最小代码，并运行列出的验证命令。每次提交后执行 `codegraph sync`。

**目标：** 保留个人笔记自动同步 Obsidian；公众号改为用户从列表主动进入的二次改写、编辑和草稿发布流程。所有“重新整理”先经用户确认。

**架构：** 个人 ASR → LLM → Obsidian 流程只保留 Obsidian 目标。独立的公众号编辑页以个人 Markdown 为只读来源，使用本地提示词模板调用同一 LLM 改写，将公众号标题、正文和草稿状态单独保存到 IndexedDB；发布仍复用已部署 Worker 的 `POST /drafts`。

**技术栈：** 现有 React、React Router、Dexie、Vitest、OpenAI 兼容 Chat Completions、Cloudflare Worker 草稿接口；不增加依赖。

## 已调研的可借鉴实现

- `references/wechat-publisher`：其 `draft/add` 与 `draft/update`、token 缓存、默认封面和错误处理模式已由现有 Worker 实现。本次继续复用，不新增 Worker 路由或密钥。
- `references/doocs-md`：可提供复杂 Markdown/微信样式编辑能力，但引入其编辑器会显著扩大依赖和界面复杂度。本次只用现有 `textarea` 与 Worker 渲染，符合个人工具的轻量边界。

## 全局约束

- `summary` 永远保存个人笔记；公众号改写结果只能写入 `wechatTitle` 与 `wechatMarkdown`。
- 配置中的 `enabled` 只表示“允许使用公众号编辑入口”，绝不能触发自动草稿同步。
- 公众号改写、Access 授权或草稿发布失败只能改变公众号子状态，不能把已成功的 Obsidian 同步或录音总状态改为失败。
- 不新增富文本编辑器、图床、草稿管理页、正式发布、账号系统或 Worker API；AppID、Secret、封面素材 ID 继续只存在 Worker Secret。
- 原先自动创建的草稿保留其 `wechatDraftMediaId`，后续手动发布应更新同一草稿。

---

## 任务 1：更新需求记录并补齐本地数据契约

**文件：**

- Modify: `.trellis/tasks/07-12-stage2-processing/prd.md`
- Modify: `src/domain/recording.ts`
- Modify: `src/lib/config-store.ts`
- Modify: `src/lib/wechat.test.ts`
- Modify: `src/lib/recording-db.test.ts`

**步骤：**

1. 将阶段 2 PRD 中“自动/手动同步至公众号”“已启用目标”“重新同步已启用目标”等表述替换为人工公众号编辑流程，并将验收标准指向已确认的 `wechat-manual-editor-design.md`；保留 Obsidian 自动同步描述。
2. 在 `Recording` 中新增可选字段：

   ```ts
   wechatTitle?: string
   wechatMarkdown?: string
   ```

   不修改 Dexie 索引，因为字段只按录音 ID 读取。
3. 在 `config-store.ts` 定义并导出：

   ```ts
   export interface WechatPromptTemplate {
     id: string
     name: string
     prompt: string
   }

   export function getWechatPromptTemplates(): WechatPromptTemplate[]
   export function saveWechatPromptTemplates(templates: WechatPromptTemplate[]): void
   ```

   使用独立 localStorage 键 `vn_wechat_prompt_templates`，首次读取时写入以下三个默认模板；后续只返回用户保存的数组：

   | id | 名称 | 提示词目标 |
   | --- | --- | --- |
   | `insight` | 观点随笔 | 保留第一人称感受和核心观点，形成有标题、分段和收束的公众号随笔。 |
   | `knowledge` | 知识分享 | 组织为问题、观点、解释和可行动建议，语言清晰克制。 |
   | `daily` | 日常记录 | 保留具体场景和情绪，改写为自然温暖的日常记录。 |

4. 先调整测试：`wechat.test.ts` 断言模板默认包含上述三个 ID、保存编辑后重新读取保持修改；`recording-db.test.ts` 断言 `wechatTitle` 和 `wechatMarkdown` 与既有草稿字段共同持久化。
5. 实现类型与存储函数，使测试通过；不得在备份导出中保存任何 Worker 密钥。

**验证：**

```bash
npm test -- src/lib/wechat.test.ts src/lib/recording-db.test.ts
```

预期：模板和草稿内容字段测试通过。

**提交：**

```bash
git add .trellis/tasks/07-12-stage2-processing/prd.md src/domain/recording.ts src/lib/config-store.ts src/lib/wechat.test.ts src/lib/recording-db.test.ts
git commit -m "feat: 增加公众号人工改写数据"
codegraph sync
```

## 任务 2：增加公众号风格改写 LLM 请求

**文件：**

- Modify: `src/lib/llm.ts`
- Modify: `src/lib/api-clients.test.ts`

**步骤：**

1. 在 `api-clients.test.ts` 先增加 `rewriteWechatArticle` 的成功用例，mock OpenAI 响应为：

   ```json
   {"title":"改写后标题","markdown":"# 改写后标题\\n\\n公众号正文"}
   ```

   断言函数返回该标题和正文，并且请求消息中包含个人 Markdown 与所选模板提示词。
2. 在 `llm.ts` 导出：

   ```ts
   export async function rewriteWechatArticle(
     sourceMarkdown: string,
     prompt: string,
     llmConfig: LLMConfig,
   ): Promise<{ title: string; markdown: string }>
   ```

   使用与 `formatNote` 相同的 endpoint、Bearer 鉴权、超时和 `response_format: { type: 'json_object' }`。系统提示明确要求：从个人笔记改写成公众号文章、不得杜撰事实、只返回 `title` 和 `markdown` 的 JSON；用户消息依次包含编辑后的公众号提示词和个人 Markdown。
3. 保持 `formatNote` 的现有提示词与行为不变；不要把个人笔记整理和公众号改写合并成带复杂分支的通用函数。

**验证：**

```bash
npm test -- src/lib/api-clients.test.ts
```

预期：个人笔记整理与公众号改写都能正确构造 OpenAI 兼容请求并解析 JSON。

**提交：**

```bash
git add src/lib/llm.ts src/lib/api-clients.test.ts
git commit -m "feat: 支持公众号文章二次改写"
codegraph sync
```

## 任务 3：从自动处理链路移除公众号发布

**文件：**

- Modify: `src/hooks/use-processor.ts`
- Delete: `src/lib/sync-targets.ts`
- Delete: `src/lib/sync-targets.test.ts`

**步骤：**

1. 删除 `sync-targets` 中“Obsidian 与公众号独立双目标”的实现和测试，避免保留任何自动调用 `publishWechatDraft` 的入口。
2. 在 `use-processor.ts` 中用既有 `isObsidianConfigured` 与 `syncToObsidian` 直接实现 `syncProcessedRecording`：

   ```ts
   const config = getSyncConfig()
   if (!isObsidianConfigured(config)) throw new Error('未配置 Obsidian 同步')
   await syncToObsidian(title, markdown, obsidianDir, config)
   ```

   成功后只写回 `status: 'synced'`、清空 `errorMessage`，并沿用当前音频保留策略；失败由已有外层 `catch` 写回录音失败状态。
3. 移除 `getWechatDraftConfig`、`syncProcessedNote` 和所有自动生成请求 ID、修改 `wechatStatus` 的代码。全流程和“重新同步”都只处理个人 Markdown → Obsidian。
4. 保持现有 `syncToObsidian` API 单测，并运行整个测试集，确认没有模块残留引用。

**验证：**

```bash
rg -n "syncProcessedNote|publishWechatDraft|getWechatDraftConfig" src/hooks src/lib
npm test
```

预期：搜索结果不包含自动处理链路；测试全绿。

**提交：**

```bash
git add src/hooks/use-processor.ts src/lib/sync-targets.ts src/lib/sync-targets.test.ts
git commit -m "refactor: 公众号改为手动发布流程"
codegraph sync
```

## 任务 4：实现公众号编辑页面与草稿状态回写

**文件：**

- Create: `src/pages/WechatEditorPage.tsx`
- Modify: `src/App.tsx`
- Modify: `src/lib/wechat.test.ts`
- Modify: `src/lib/recording-db.test.ts`（仅在任务 1 未覆盖发布字段时）

**步骤：**

1. 新增路由：

   ```tsx
   <Route path="/recordings/:recordingId/wechat" element={<WechatEditorPage />} />
   ```

2. 编辑页读取录音、`getWechatDraftConfig()`、`getWechatPromptTemplates()` 和 `getLLMConfig()`；没有录音、没有 `summary` 或公众号功能未启用/未配置 URL 时显示明确说明和返回列表按钮，不发起 LLM/Worker 请求。
3. 正常页面按以下顺序显示：

   - 只读的“个人笔记参考” Markdown 文本区（`summary`）；
   - 原生 `select` 选择三个模板；切换后载入该模板的 prompt；
   - 可编辑 prompt 文本区，失焦时用 `saveWechatPromptTemplates` 保存到当前模板；
   - “生成公众号版本”按钮：调用 `rewriteWechatArticle(summary, prompt, getLLMConfig())`，只写入并显示 `wechatTitle`、`wechatMarkdown`，不触碰 `summary` 或录音总状态；
   - 可编辑标题 input 和 Markdown textarea，修改时写回 IndexedDB；
   - “发布到草稿箱”按钮。

4. 发布前要求标题和正文均非空。每次点击生成新的 `requestId`，先写入 `wechatStatus: 'syncing'`、清空子错误，再调用现有：

   ```ts
   publishWechatDraft(config, {
     recordingId: recording.id,
     requestId,
     title: wechatTitle,
     markdown: wechatMarkdown,
     draftMediaId: recording.wechatDraftMediaId,
   })
   ```

   成功时保存 `wechatStatus: 'drafted'`、返回的 `wechatDraftMediaId` 和请求 ID；失败时仅保存 `wechatStatus: 'failed'` 或 `authorization_required` 与中文错误。无论成败都不写录音 `status` 或 `errorMessage`。
5. 在 `wechat.test.ts` 补充一次“有 draftMediaId 的请求仍原样传给 Worker”的断言；首次/再次发布由现有 Worker 集成行为和手动验收共同覆盖。

**验证：**

```bash
npm test -- src/lib/wechat.test.ts src/lib/recording-db.test.ts src/lib/api-clients.test.ts
npm run build
```

预期：页面可编译；公众号请求包含已有草稿 ID，个人笔记字段不被覆盖。

**提交：**

```bash
git add src/pages/WechatEditorPage.tsx src/App.tsx src/lib/wechat.test.ts src/lib/recording-db.test.ts
git commit -m "feat: 增加公众号人工编辑页"
codegraph sync
```

## 任务 5：调整列表、详情、设置与备份交互

**文件：**

- Modify: `src/components/RecordingCard.tsx`
- Modify: `src/pages/RecordingDetailPage.tsx`
- Modify: `src/pages/SettingsPage.tsx`
- Modify: `src/styles.css`

**步骤：**

1. 在列表卡片的“重新整理”点击处理函数开头加入：

   ```ts
   if (!window.confirm('重新整理会再次调用转写和 AI，并覆盖当前个人笔记。确定继续吗？')) return
   ```

   取消时绝不调用 `processRecording`。详情页的“重新整理生成”使用同样确认；“重新同步”维持其不重写个人笔记的现有行为。
2. 对有 `summary` 的列表卡片，在下载按钮前加入固定宽度的微信图标按钮（内联、带 `aria-label="改写公众号文章"`），点击后 `navigate('/recordings/:id/wechat')` 并阻止卡片导航。功能未启用或 Worker URL 为空时禁用该按钮，标签说明“请先在设置启用公众号编辑并填写服务地址”。
3. 在详情同步信息中把“公众号草稿”文案从“未启用或尚未同步”改为“尚未创建草稿”，保留已有草稿/失败/待授权状态。可增加同一路由入口，但不新增第二个发布流程。
4. 设置页：

   - 自动处理说明改成“自动转写、整理并同步到 Obsidian”；
   - 公众号开关文案改成“启用公众号草稿编辑”，摘要改成“手动改写后发布到草稿箱”；
   - 服务地址、测试连接与重新授权保留；
   - 导出备份加入 `wechatPromptTemplates`，导入时仅当它是数组才恢复模板。继续排除 LLM API Key、Obsidian token 与所有 Worker 密钥。

5. 只为列表微信图标补充 `.action.wechat-btn { flex: 0 0 42px; }` 等必要样式；不改变其余卡片按钮的换行和尺寸策略。

**验证：**

```bash
npm run build
npm test
```

手动验收（本地或预览环境）：

1. 点击列表和详情“重新整理”后取消确认，录音状态和文本不变化；确认后才进入处理中。
2. 完成一条个人笔记，确认只同步 Obsidian，公众号草稿状态不自动变化。
3. 从列表微信图标进入编辑页，编辑模板并刷新页面，模板文本仍保留。
4. 改写后确认个人 `summary` 未变化；首次发布创建草稿，再次编辑发布更新同一草稿。
5. 让 Access 会话失效或填入错误 Worker 地址，确认只有公众号提示错误，录音仍保持已同步。

**提交：**

```bash
git add src/components/RecordingCard.tsx src/pages/RecordingDetailPage.tsx src/pages/SettingsPage.tsx src/styles.css
git commit -m "feat: 完善公众号人工改写交互"
codegraph sync
```

## 任务 6：完整验证与生产部署

**文件：**

- Modify: `.trellis/tasks/07-12-stage2-processing/check.jsonl`（追加本次验证记录）

**步骤：**

1. 运行前端全量测试与构建；Worker 无源代码改动，只运行其回归测试。
2. 使用 Vercel 当前项目配置部署生产版本，等待 Ready，记录生产部署 URL；确认 `obvoice.lucc.fun` 仍指向新部署。
3. 在手机 PWA 点击“发现新版本，点击更新”或关闭后重新打开，按任务 5 的手动验收流程完成一次真实草稿创建和更新；不进行正式发表。
4. 将命令结果、部署 URL、草稿创建/更新的结论（不记录 token、Secret 或个人正文）追加到 `check.jsonl`。

**验证：**

```bash
npm test
npm run build
npm --prefix workers/wechat-draft test
npm --prefix workers/wechat-draft run check
npx vercel --prod --yes
```

预期：所有测试与构建通过，Vercel 生产部署 Ready，手机端可手动完成草稿创建和更新。

**提交：**

```bash
git add .trellis/tasks/07-12-stage2-processing/check.jsonl
git commit -m "docs: 记录公众号人工改写验证结果"
codegraph sync
```
