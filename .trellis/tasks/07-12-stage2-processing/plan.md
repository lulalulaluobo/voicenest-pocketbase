# Voice Inbox 阶段 2：ASR 转写、LLM 整理与 Obsidian 同步 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 Voice Inbox PWA 的 ASR 转写、LLM 整理与 Fast Note Sync 自动/手动同步写入到 Obsidian 的流程，支持设置配置、状态过滤及容灾重试。

**Architecture:** 
1. **数据库层**：扩展 Dexie 元数据字段，支撑文本保存；
2. **API 客户端层**：封装 HTTP Client（ASR Form-Data、LLM Chat-Completions、Obsidian Sync API）；
3. **设置层**：用 LocalStorage 管理配置参数并支持笔记类型 CRUD 交互；
4. **处理管道 (Hook)**：`useProcessor` 编排 ASR -> LLM -> Sync 的流水线，管理前台网络侦测及异步自动处理队列。

**Tech Stack:** React (v18), TypeScript, Dexie, React Router, vitest, fake-indexeddb, localforage / LocalStorage, Fast Note Sync API.

## Global Constraints

- 不增加后端，不依赖云服务，所有 HTTP 请求直接从浏览器端发起；
- 转写采用 Blob 拼接文件上传形式（封装 File 对象指定文件名后缀）；
- 交互流不强制打断，同步失败只支持整体重新整理，本地分片永久保留由用户手动清除；
- 网络状态检测依靠 `navigator.onLine` 与 `online` / `offline` 浏览器事件，仅在前台消费队列；
- UI 点击区域须大于 44px 乘 44px。

---

## 任务 1：升级数据库 Schema 与实现 API 客户端

**Files:**
- Modify: `src/lib/recording-db.ts`
- Create: `src/lib/asr.ts`
- Create: `src/lib/llm.ts`
- Create: `src/lib/sync.ts`
- Create: `src/lib/api-clients.test.ts`

**Interfaces:**
- Consumes: Dexie, fetch
- Produces: 升级版的 Dexie Schema；`transcribeAudio`, `formatNote`, `syncToObsidian` 三个基础 API 方法。

- [ ] **Step 1: 在测试中编写数据库字段扩展验证 (TDD 失败测试)**
  修改 `src/lib/recording-db.test.ts`，在最底下添加测试以验证新增的 `transcript`、`summary` 与 `errorMessage` 字段可正常存取。
  ```typescript
  it('should support transcript, summary and errorMessage fields', async () => {
    const rec = await createRecording({
      id: 'rec_ext',
      typeId: 'idea',
      typeName: '随想',
      mimeType: 'audio/webm',
      localTitle: '扩展测试'
    })
    
    await db.recordings.update('rec_ext', {
      transcript: '这是原始转写文本',
      summary: '# 标题\n这是 LLM 整理文本',
      errorMessage: '网络连接失败'
    })

    const updated = await db.recordings.get('rec_ext')
    expect(updated?.transcript).toBe('这是原始转写文本')
    expect(updated?.summary).toBe('# 标题\n这是 LLM 整理文本')
    expect(updated?.errorMessage).toBe('网络连接失败')
  })
  ```

- [ ] **Step 2: 升级数据库 Schema 结构声明**
  修改 `src/lib/recording-db.ts`。
  将 `Recording` 接口类型进行扩充，并使 Dexie 升级为版本 2，以支持 `typeId` 键的本地索引优化：
  ```typescript
  // 修改后对应的 stores 配置：
  this.version(2).stores({
    recordings: 'id, createdAt, status, typeId',
    audioChunks: 'id, recordingId, [recordingId+index]'
  })
  ```

- [ ] **Step 3: 运行测试验证数据库成功**
  Run: `npm run test`
  Expected: 数据库新增字段测试及所有老测试应成功通过。

- [ ] **Step 4: 编写 ASR/LLM/Sync 客户端单元测试 (TDD 失败测试)**
  新建 `src/lib/api-clients.test.ts`，对 API 请求调用进行单元测试并 Mock `global.fetch`。
  ```typescript
  import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
  import { transcribeAudio } from './asr'
  import { formatNote } from './llm'
  import { syncToObsidian } from './sync'

  describe('API Clients Unit Tests', () => {
    const originalFetch = global.fetch

    beforeEach(() => {
      global.fetch = vi.fn()
    })

    afterEach(() => {
      global.fetch = originalFetch
      vi.restoreAllMocks()
    })

    it('should send form data correctly in transcribeAudio', async () => {
      const mockBlob = new Blob(['wav-content'], { type: 'audio/webm' })
      const mockResponse = { text: '转写成功内容' }
      
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      } as Response)

      const text = await transcribeAudio(mockBlob, {
        type: 'openai',
        endpoint: 'https://api.openai.com/v1',
        apiKey: 'sk-test',
        model: 'whisper-1'
      })

      expect(text).toBe('转写成功内容')
      expect(global.fetch).toHaveBeenCalledTimes(1)
    })

    it('should format note via LLM chat completions and parse JSON', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                title: '整理后标题',
                markdown: '# 整理后标题\n这是正文内容'
              })
            }
          }
        ]
      }

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      } as Response)

      const res = await formatNote('原始转写内容', {
        name: '随想',
        prompt: '整理它',
        template: '{{content}}'
      }, {
        endpoint: 'https://api.openai.com/v1',
        apiKey: 'sk-test',
        model: 'gpt-4o'
      })

      expect(res.title).toBe('整理后标题')
      expect(res.markdown).toContain('这是正文内容')
    })

    it('should sync markdown file to Obsidian via Fast Note Sync', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        status: 200
      } as Response)

      await expect(
        syncToObsidian('测试文件', '# 内容', '/path/to/Obsidian', {
          endpoint: 'http://localhost:8080/sync'
        })
      ).resolves.not.toThrow()
    })
  })
  ```

- [ ] **Step 5: 运行客户端测试验证失败**
  Run: `npm run test -- src/lib/api-clients.test.ts`
  Expected: 测试报错，提示文件未找到或未定义。

- [ ] **Step 6: 实现 ASR/LLM/Sync 客户端代码**
  - 新建 `src/lib/asr.ts`，对 Blob 进行包装为 File 对象，向 `/audio/transcriptions` 发起请求。
    ```typescript
    export interface ASRConfig {
      type: 'step' | 'openai' | 'custom'
      endpoint: string
      apiKey: string
      model: string
      timeoutMs?: number
    }

    export async function transcribeAudio(blob: Blob, config: ASRConfig): Promise<string> {
      const ext = blob.type.includes('mp4') ? 'mp4' : 'webm'
      const file = new File([blob], `audio.${ext}`, { type: blob.type })
      const formData = new FormData()
      formData.append('file', file)
      formData.append('model', config.model)

      const url = `${config.endpoint.replace(/\/+$/, '')}/audio/transcriptions`
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs || 30000)

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.apiKey}`
          },
          body: formData,
          signal: controller.signal
        })
        clearTimeout(timeoutId)

        if (!response.ok) {
          const errText = await response.text().catch(() => '')
          throw new Error(`ASR API 调用失败 (${response.status}): ${errText}`)
        }

        const data = await response.json()
        return data.text || ''
      } catch (err: any) {
        clearTimeout(timeoutId)
        throw err
      }
    }
    ```
  - 新建 `src/lib/llm.ts`，将提示词与模板结合传入 Chat Completions，并支持防错式提取 JSON 字符串结构。
    ```typescript
    export interface LLMConfig {
      endpoint: string
      apiKey: string
      model: string
      timeoutMs?: number
    }

    export interface NoteTypeConfig {
      name: string
      prompt: string
      template: string
    }

    export async function formatNote(
      transcript: string,
      typeConfig: NoteTypeConfig,
      llmConfig: LLMConfig
    ): Promise<{ title: string; markdown: string }> {
      const systemPrompt = `你是一个智能笔记整理助手。请将用户的口语原始转写文本整理成结构化的 Markdown 笔记。
  你必须严格返回一个 JSON 对象，不要包含 markdown 标记或任何 json 之外的解释，格式如下：
  {
    "title": "笔记标题（基于转写内容生成）",
    "markdown": "基于所选模板生成的 Markdown 内容"
  }`

      const userContent = `【当前笔记类型】：${typeConfig.name}
  【笔记整理提示词】：${typeConfig.prompt}
  【Markdown 模板结构】：\n${typeConfig.template}
  
  【原始转写文本】：
  """
  ${transcript}
  """
  
  请按模板和类型提示词生成结果：`

      const url = `${llmConfig.endpoint.replace(/\/+$/, '')}/chat/completions`
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), llmConfig.timeoutMs || 30000)

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${llmConfig.apiKey}`
          },
          body: JSON.stringify({
            model: llmConfig.model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userContent }
            ],
            response_format: { type: 'json_object' }
          }),
          signal: controller.signal
        })
        clearTimeout(timeoutId)

        if (!response.ok) {
          const errText = await response.text().catch(() => '')
          throw new Error(`LLM API 调用失败 (${response.status}): ${errText}`)
        }

        const data = await response.json()
        const content = data.choices?.[0]?.message?.content || ''
        
        const parsed = JSON.parse(content.trim())
        if (!parsed.title || !parsed.markdown) {
          throw new Error('LLM 响应缺失必需的 title 或 markdown 属性。')
        }
        return parsed
      } catch (err: any) {
        clearTimeout(timeoutId)
        throw err
      }
    }
    ```
  - 新建 `src/lib/sync.ts`，调用 Fast Note Sync HTTP API。
    ```typescript
    export interface SyncConfig {
      endpoint: string
    }

    export async function syncToObsidian(
      title: string,
      markdown: string,
      obsidianPath: string,
      config: SyncConfig
    ): Promise<void> {
      const url = config.endpoint.replace(/\/+$/, '')
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title,
          content: markdown,
          path: obsidianPath
        })
      })

      if (!response.ok) {
        const errText = await response.text().catch(() => '')
        throw new Error(`Fast Note Sync 同步失败 (${response.status}): ${errText}`)
      }
    }
    ```

- [ ] **Step 7: 重新运行测试验证通过**
  Run: `npm run test`
  Expected: 包括客户端 API 测试在内的 9 项测试应全数成功通过。

- [ ] **Step 8: Git 提交**
  Run: `git add . && git commit -m "feat: 升级数据库索引并开发 ASR/LLM/Sync API 客户端组件"`

---

## 任务 2：实现设置配置与自定义类型管理

**Files:**
- Create: `src/lib/config-store.ts`
- Modify: `src/pages/SettingsPage.tsx`

**Interfaces:**
- Consumes: LocalStorage
- Produces: `getASRConfig`, `saveASRConfig`, `getLLMConfig`, `saveLLMConfig`, `getSyncConfig`, `saveSyncConfig`, `getNoteTypes`, `saveNoteTypes` 配置存储接口。

- [ ] **Step 1: 编写配置本地存储实现**
  新建 `src/lib/config-store.ts`，持久化管理 ASR、LLM、Sync 及笔记类型配置，并对默认的“随想、日记、会议、项目”配置进行初始化。
  ```typescript
  import type { ASRConfig } from './asr'
  import type { LLMConfig } from './llm'
  import type { SyncConfig } from './sync'

  export interface UserNoteType {
    id: string
    name: string
    prompt: string
    template: string
    obsidianPath: string
    isDefault?: boolean
    overrideLLM?: boolean
    llmConfig?: LLMConfig
  }

  const DEFAULT_NOTE_TYPES: UserNoteType[] = [
    {
      id: 'idea',
      name: '随想',
      prompt: '梳理成精炼、分段清晰的灵感笔记，提炼出 3 个关键词。',
      template: '# {{title}}\n\n## 💡 核心观点\n- \n\n## 📝 详细内容\n{{content}}\n\n---\n标签: #随想 #{{tags}}',
      obsidianPath: 'Inbox/Ideas',
      isDefault: true
    },
    {
      id: 'journal',
      name: '日记',
      prompt: '整理为温暖感性的日记，包含当天活动、所思所想和情绪提炼。',
      template: '# {{title}}\n\n## 📅 日记详情\n{{content}}\n\n## 🧠 今日反思与感悟\n- \n\n---\n标签: #日记',
      obsidianPath: 'Inbox/Journals'
    },
    {
      id: 'meeting',
      name: '会议',
      prompt: '梳理成专业的会议纪要，包含参与人员、核心议题、会议决策以及 Todo 待办事项。',
      template: '# {{title}}\n\n## 👥 参会背景\n\n## 🎯 决策与共识\n- \n\n## ⏳ 行动项 (Todo)\n- [ ] \n\n## 📋 会议记录\n{{content}}',
      obsidianPath: 'Inbox/Meetings'
    },
    {
      id: 'project',
      name: '项目',
      prompt: '整理为结构化的项目备忘录，理清技术方案、当前进度和阻塞点。',
      template: '# {{title}}\n\n## 🚀 项目规划\n\n## 🛠️ 技术细节\n{{content}}\n\n## 🚧 遗留问题与待办\n- [ ] ',
      obsidianPath: 'Inbox/Projects'
    }
  ]

  export function getASRConfig(): ASRConfig {
    const data = localStorage.getItem('vn_asr')
    return data ? JSON.parse(data) : { type: 'openai', endpoint: 'https://api.openai.com/v1', apiKey: '', model: 'whisper-1' }
  }

  export function saveASRConfig(cfg: ASRConfig): void {
    localStorage.setItem('vn_asr', JSON.stringify(cfg))
  }

  export function getLLMConfig(): LLMConfig {
    const data = localStorage.getItem('vn_llm')
    return data ? JSON.parse(data) : { endpoint: 'https://api.openai.com/v1', apiKey: '', model: 'gpt-4o' }
  }

  export function saveLLMConfig(cfg: LLMConfig): void {
    localStorage.setItem('vn_llm', JSON.stringify(cfg))
  }

  export function getSyncConfig(): SyncConfig {
    const data = localStorage.getItem('vn_sync')
    return data ? JSON.parse(data) : { endpoint: 'http://localhost:8080/sync' }
  }

  export function saveSyncConfig(cfg: SyncConfig): void {
    localStorage.setItem('vn_sync', JSON.stringify(cfg))
  }

  export function getNoteTypes(): UserNoteType[] {
    const data = localStorage.getItem('vn_note_types')
    if (!data) {
      localStorage.setItem('vn_note_types', JSON.stringify(DEFAULT_NOTE_TYPES))
      return DEFAULT_NOTE_TYPES
    }
    return JSON.parse(data)
  }

  export function saveNoteTypes(types: UserNoteType[]): void {
    localStorage.setItem('vn_note_types', JSON.stringify(types))
  }
  ```

- [ ] **Step 2: 重新实现 SettingsPage.tsx，支持完整的 API 表单与类型 CRUD**
  覆盖 `src/pages/SettingsPage.tsx`。支持 ASR, LLM, Fast Note Sync 的表单持久化及配置的“测试连接”（使用 mock 流及 mock 请求检验配置）。
  同时为笔记类型（UserNoteType）提供创建、修改配置、以及删除操作，界面采用现代玻璃卡片风格，确保每个交互点击区域大于 44px。

- [ ] **Step 3: 运行打包与测试验证**
  Run: `npm run test && npm run build`
  Expected: 打包成功无任何错误。

- [ ] **Step 4: Git 提交**
  Run: `git add . && git commit -m "feat: 实现设置页的 API 连接管理与笔记类型 CRUD 自定义机制"`

---

## 任务 3: 实现录音处理状态流、详情页编辑与控制按钮

**Files:**
- Modify: `src/pages/RecordingsPage.tsx`
- Modify: `src/pages/RecordingDetailPage.tsx`
- Modify: `src/components/RecordingCard.tsx`
- Modify: `src/components/StatusBadge.tsx`

**Interfaces:**
- Consumes: `db` 字段、`deleteRecording`
- Produces: 列表页与详情页的转写/整理文本框编辑联动，以及状态变化自动刷新

- [ ] **Step 1: 丰富 StatusBadge 以支持更多状态色**
  修改 `src/components/StatusBadge.tsx`，支持 `waiting_network` (等待网络，橙色)、`processing` (处理中，蓝色带旋转特效)、`ready` (未整理，灰色)、`synced` (已同步，绿色)、`failed` (失败，红色)。

- [ ] **Step 2: 修改 RecordingCard 界面**
  修改 `src/components/RecordingCard.tsx`，确保其按新版状态角标正常渲染，并在列表中提示简短的 `errorMessage`，提供卡片点击跳转。

- [ ] **Step 3: 修改 RecordingsPage 筛选器**
  修改 `src/pages/RecordingsPage.tsx`，支持根据 `waiting_network | processing | synced | failed | ready` 状态和自定义笔记类型 ID 进行多维组合筛选。

- [ ] **Step 4: 重构详情页 RecordingDetailPage 为可编辑面板**
  重构 `src/pages/RecordingDetailPage.tsx`：
  - 支持转写文本 `transcript` 与整理结果 `summary` 以 `<textarea>` 显示并支持手动编辑修改，实时保存回数据库；
  - 显示 `errorMessage` 以 `role="alert"` 指示出错原因；
  - 提供“上传并整理”、“重新整理”（ASR+LLM）以及“仅同步到 Obsidian”三大按钮，点击时切换按钮为禁用态且显示 Loading 状态。

- [ ] **Step 5: 验证打包**
  Run: `npm run build`
  Expected: 顺利编译且无错误。

- [ ] **Step 6: Git 提交**
  Run: `git add . && git commit -m "feat: 实现音频列表筛选、状态角标进化与详情页文字编辑机制"`

---

## 任务 4: 实现 useProcessor 自动/手动处理管道与前台网络队列

**Files:**
- Create: `src/hooks/use-processor.ts`
- Modify: `src/pages/HomePage.tsx`
- Modify: `src/pages/RecordingsPage.tsx`
- Modify: `src/pages/RecordingDetailPage.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `db` 操作 API, `transcribeAudio`, `formatNote`, `syncToObsidian`
- Produces: `useProcessor` Hook 及其自动处理消费队列

- [ ] **Step 1: 编写任务处理 useProcessor Hook**
  新建 `src/hooks/use-processor.ts`，负责对单条音频执行 ASR -> LLM -> Sync 的异步任务调度。
  包含以下特征：
  - 合并音频分片 Blob 列表为单个 Blob；
  - 自动读取 ASR / LLM / Sync 相关的全局或定制配置；
  - 提供 `process(id: string, mode: 'full' | 'sync_only'): Promise<void>` 方法；
  - 捕获异常：记录详细错误 `errorMessage` 并置状态为 `failed`；
  - 网络监听与前台等待：维护 `online` 状态，当开启了自动处理且网络从离线变回在线时，使用 `navigator.onLine` 检验，依次拉取状态为 `waiting_network` 的最旧条目并进行处理；
  - 用 `vietest` 确保该 Hook 调度正常。

- [ ] **Step 2: 在首页、列表页及详情页引入 useProcessor**
  - 在详情页 `RecordingDetailPage` 和列表卡片中，将手动触发的操作绑定到 `useProcessor` 的 API 上，使状态变迁在 UI 上实时改变。
  - 主页 `HomePage` 在录音完成后，根据“自动处理”开关选项，若开启了，自动触发 `process` 整理调用。

- [ ] **Step 3: 在 App.tsx 启动自动网络队列处理**
  - 在 `App.tsx` 中使用 `useProcessor` 初始化全局网络状态监听事件，前台处于 active 状态且联网时触发消费。

- [ ] **Step 4: 运行全部测试与静态编译**
  Run: `npm run test && npm run build`
  Expected: 全部绿灯。

- [ ] **Step 5: Git 提交**
  Run: `git add . && git commit -m "feat: 实现 useProcessor 网络自适应任务队列与自动异步消费流"`

---

## 任务 5: 全量验证、真机调试、验收与同步

**Files:**
- Modify: `vite.config.ts`

- [ ] **Step 1: 执行全量测试**
  Run: `npm run test`
  Expected: 所有测试完全通过。

- [ ] **Step 2: 编译打包**
  Run: `npm run build`
  Expected: 生成正确的生产静态包，无警告。

- [ ] **Step 3: 本地开发预览模式**
  Run: `npm run preview`
  Expected: 成功启动并可以在本地访问静态打包结果。

- [ ] **Step 4: 代码规范性检查**
  Run: `git diff --check`
  Expected: 没有尾随空格等问题。

- [ ] **Step 5: 同步索引**
  Run: `codegraph sync`
  Expected: 索引更新成功。

- [ ] **Step 6: Git 提交与完成**
  Run: `git add . && git commit -m "feat: 顺利完成阶段二 ASR、LLM 与 Obsidian 同步的全部开发与部署验证"`

---

## Verification Plan

### Automated Tests
- 运行 Vitest 测试套件：
  ```bash
  npm run test
  ```
  预期通过包含新增 API Mock 单元测试在内的所有用例。

### Manual Verification
1. **测试连接验证**：
   - 进入设置页配置无效 API Key，点击“测试连接”，预期立刻弹出包含错误原因的警告卡片；配置正确 key，测试通过。
2. **手动/自动全链路验证**：
   - 录制一段 10 秒左右便签，在首页点击“上传并整理”，卡片进入“处理中”，并在 5-15 秒后成功变更为“已同步”。
   - 打开 Obsidian 的 Fast Note Sync 对应的目录，查看生成的 Markdown 笔记是否符合类型模板。
3. **文本二次编辑与仅同步验证**：
   - 详情页中对“整理后的 Markdown”内容手动输入修改一段待办，点击“仅同步到 Obsidian”，状态显示更新，并在 Obsidian 中验证笔记确实被修改后的版本覆盖。
4. **离线与断网容灾验证**：
   - 电脑拔网线 / 手机开飞行模式后，开启自动处理，进行一次录音。录音保存后，首页卡片应该显示为 `等待网络`。
   - 重新联网，预期在前台网页上卡片能够自动重试，状态从 `等待网络` 变更为 `处理中` 并最终变成 `已同步`。
