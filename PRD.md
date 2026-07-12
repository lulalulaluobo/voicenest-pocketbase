# Voice Inbox PWA 产品需求文档（PRD）

> 版本：v1.0  
> 日期：2026-07-12  
> 产品形态：个人使用的 React PWA  
> 核心链路：录音 → ASR 转写 → LLM 整理 → Fast Note Sync → Obsidian

---

## 1. 产品概述

Voice Inbox 是一个面向 Obsidian 用户的极简语音收件箱。用户在手机桌面打开 PWA，选择笔记类型并开始录音。录音默认保存到本地音频列表；用户可以手动处理，也可以在设置中开启录音结束后自动处理。

处理流程由手机 PWA 直接调用：

1. ASR 服务将音频转为原始文本；
2. LLM 按当前笔记类型的提示词、模板和规则整理文本；
3. Fast Note Sync API 将 Markdown 写入指定 Obsidian 路径。

本项目只供个人使用，首版不建设独立后端，不包含账号、会员、计费和多人协作。

---

## 2. 产品目标

### 2.1 核心目标

- 将“想到一个想法”到“开始记录”的操作压缩为：打开桌面图标 → 点击录音。
- 避免用户先手动转写、再回到 Obsidian 找笔记、再调用 AI 整理。
- 将零散口语自动转成可直接进入 Obsidian 的结构化 Markdown。
- 保留本地音频、原始转写和整理结果，支持查看、修改、重新整理和重新同步。
- 在纯 PWA 条件下，优先保证短录音和 30 分钟以内录音的可靠性。

### 2.2 非目标

首版不做：

- 独立云端后端；
- 用户账号、会员、套餐与计费；
- 多设备实时同步；
- 后台或锁屏稳定录音；
- 后台持续处理任务；
- 删除或移动已写入 Obsidian 的旧笔记；
- 实时流式转写；
- 团队协作、共享录音；
- App Store / Google Play 原生发布。

---

## 3. 目标用户与使用场景

### 3.1 目标用户

- 个人用户；
- 日常使用 Obsidian；
- 经常产生随想、日记、会议记录、项目想法；
- 愿意自行配置 ASR、LLM 和 Fast Note Sync API；
- 接受 PWA 在录音和处理期间保持前台。

### 3.2 典型场景

1. **随想**：几十秒到几分钟，快速记录一个观点或创意。
2. **日记**：口述当天经历、情绪、反思，由 LLM 整理为日记。
3. **会议**：最长约 30 分钟，输出议题、决定、行动项。
4. **项目记录**：口述需求、问题、待办、方案，写入项目路径。

---

## 4. 核心用户流程

### 4.1 默认手动处理流程

```text
打开桌面 PWA
→ 进入极简录音主页
→ 选择笔记类型
→ 点击开始录音
→ 可暂停 / 继续
→ 点击完成
→ 音频保存到本地列表
→ 页面自动滚动到最新录音并高亮 2 秒
→ 点击“上传并整理”
→ ASR 转写
→ LLM 整理并生成标题、文件名和 Markdown
→ Fast Note Sync 写入 Obsidian
→ 成功通知
```

### 4.2 自动处理流程

用户在设置中开启“录音结束后自动处理”后：

```text
完成录音
→ 保存到本地任务队列
→ 网络可用时自动执行 ASR、LLM、同步
→ 成功或失败时通知
```

无网络时，任务标记为“等待网络”。网络恢复后根据设置自动继续，或提示用户手动继续。

---

## 5. 信息架构

底部导航固定为三项：

1. **录音**：录音入口、类型选择、最近两条录音；
2. **列表**：所有录音、筛选、任务状态和操作；
3. **设置**：录音、网络、模型、同步、类型、保留与备份配置。

录音卡片点击后进入独立详情页。

---

## 6. 功能需求

## 6.1 主页与录音

### 6.1.1 页面结构

- 顶部：产品名 / 页面标题、设置快捷按钮；
- 类型选择：展示最多 4 个常用类型；
- “更多”按钮：打开底部抽屉显示全部类型；
- 中央：大型录音按钮；
- 下方：最近两条录音；
- 底部：录音 / 列表 / 设置导航。

### 6.1.2 类型默认逻辑

- 用户可以在设置中指定固定默认类型；
- 未指定固定默认类型时，记住上次使用的类型；
- 录音前可以随时切换类型；
- 录音完成后，在处理前或处理后都允许修改类型并重新整理、重新同步。

### 6.1.3 录音操作

- 点击一次开始录音；
- 录音中显示：红色按钮、计时、正在录音、暂停/继续、完成；
- 不显示实时波形或音量动画；
- 支持暂停与继续；
- 录音期间页面保持前台；
- 使用 Screen Wake Lock API 尽量阻止息屏；
- 预计最长单条录音：30 分钟；
- 首版不要求锁屏或切换 App 后继续录音。

### 6.1.4 录音完成反馈

- 不显示完成卡片；
- 新录音插入“最近录音”第一条；
- 页面平滑滚动到该卡片；
- 新卡片高亮约 2 秒后恢复；
- 卡片显示：录音时间、类型、时长、状态；
- 直接操作：播放、上传并整理；
- 删除等低频操作放入“更多”菜单。

---

## 6.2 本地录音与可靠性

### 6.2.1 音频格式

- 首版使用 `webm/opus`；
- 使用浏览器 `MediaRecorder`；
- 接入 StepAudio 前必须验证其是否直接接受该格式；
- 如不兼容，首版优先调整 MediaRecorder MIME 类型或请求适配，不默认实现浏览器端重型转码。

### 6.2.2 分片保存

- 录音过程中每约 5 秒生成并写入一个音频分片；
- 分片保存到 IndexedDB；
- 完成录音后保存分片清单和录音元数据；
- 处理时可合并为 Blob 或按接口要求上传。

### 6.2.3 异常恢复

遇到刷新、浏览器崩溃、断电：

- 下次打开时检测 `recording` 状态但未正常完成的任务；
- 提示用户“发现未完成录音”；
- 自动恢复已写入 IndexedDB 的分片；
- 最多允许丢失最后约 5 秒；
- 恢复后的录音标记为“异常恢复”。

### 6.2.4 系统中断

来电、麦克风被系统收回或其他系统中断时：

- 自动停止；
- 保存已录部分；
- 状态标记为“录音被中断”；
- 不自动将之后的新录音与原录音拼接。

### 6.2.5 麦克风异常

权限被拒绝、设备不可用或被占用时：

- 显示可理解的错误原因；
- 提供“重新授权 / 重试”；
- 不提供复杂的各浏览器设置路径教学。

### 6.2.6 存储不足

- 尝试通过 Storage API 获取配额；
- 空间接近不足时提前警告；
- 写入失败时自动停止录音并保存已录部分；
- 不继续无保证地录制。

---

## 6.3 音频列表

### 6.3.1 列表信息

每条录音显示：

- 当前标题：未处理时为“时间 + 类型”，处理后为 LLM 标题；
- 录音时间；
- 笔记类型；
- 录音时长；
- 处理状态；
- 必要的错误摘要。

### 6.3.2 状态筛选

支持：

- 全部；
- 待处理；
- 等待网络；
- 处理中；
- 已同步；
- 失败。

### 6.3.3 卡片操作

直接显示：

- 播放 / 暂停；
- 上传并整理，或查看进度。

“更多”菜单包括：

- 修改类型；
- 查看详情；
- 重新整理；
- 重新同步；
- 另存为新笔记；
- 删除本地录音。

### 6.3.4 删除规则

- 未同步录音：必须二次确认；
- 已同步录音：可以直接删除本地音频；
- App 不删除 Obsidian 中的笔记。

---

## 6.4 录音详情页

详情页展示：

1. 标题；
2. 当前状态；
3. 音频播放器；
4. 录音时间、类型、时长；
5. 当前 Obsidian 路径和文件名；
6. 原始转写文本；
7. 整理后的 Markdown；
8. 错误信息与重试记录；
9. 修改类型；
10. 编辑原始转写；
11. 编辑整理结果；
12. 重新整理；
13. 重新同步；
14. 另存为新笔记；
15. 删除本地音频。

默认全自动处理，不要求用户在 ASR 后确认原文。用户可在详情页查看、编辑并重新处理。

---

## 6.5 笔记类型管理

类型完全由用户管理，可新增、删除、重命名和排序。

每种类型包含：

| 字段 | 说明 |
|---|---|
| 名称 | 如随想、日记、会议、项目 |
| 图标 | 可选，用于类型标签 |
| Obsidian 路径 | Fast Note Sync 的目标目录 |
| 整理提示词 | 当前类型专属的 LLM 指令 |
| 文件名规则 | 基于标题、日期和变量生成 |
| Markdown 模板 | 最终笔记结构 |
| 默认标签 | 写入 YAML 或正文 |
| LLM 配置 | 默认继承全局，可单独覆盖 |
| 常用类型 | 是否显示在主页前 4 个位置 |
| 默认类型 | 全局最多指定一个 |

### 6.5.1 建议内置示例类型

内置示例可以删除：

- 随想；
- 日记；
- 会议；
- 项目。

它们只是首次配置模板，不是固定系统类型。

### 6.5.2 模板变量建议

```text
{{title}}
{{date}}
{{time}}
{{datetime}}
{{type}}
{{duration}}
{{transcript}}
{{content}}
{{tags}}
```

---

## 6.6 ASR 配置

### 6.6.1 接入方式

提供预设，同时允许自定义。

默认推荐预设：

- 阶跃星辰 `stepaudio-2.5-asr`；
- 用户自行填写 API Key；
- 适合短录音和 30 分钟以内音频。

其他预设：

- OpenAI Whisper 兼容接口；
- 本地或局域网 Whisper 兼容接口；
- 自定义远程 ASR。

### 6.6.2 配置字段

- 配置名称；
- 服务类型；
- Base URL / Endpoint；
- API Key；
- 模型名；
- 可选请求头；
- 超时时间；
- 是否启用。

### 6.6.3 测试连接

ASR 设置提供独立“测试连接”按钮：

- 使用一段内置或用户录制的极短测试音频；
- 返回连接成功、模型不可用、密钥错误、余额不足、格式不支持、超时等明确结果。

---

## 6.7 LLM 配置

### 6.7.1 配置策略

- 全局默认 LLM；
- 每种笔记类型可选择继承全局或覆盖为独立模型；
- 支持 OpenAI 兼容 Chat Completions 接口；
- 用户填写 Base URL、API Key、模型名。

### 6.7.2 LLM 输出要求

模型需要输出结构化结果，至少包括：

```json
{
  "title": "笔记标题",
  "markdown": "完整 Markdown 正文"
}
```

推荐通过 JSON Schema 或严格 JSON 提示词降低解析失败。

### 6.7.3 测试连接

- LLM 配置提供独立测试按钮；
- 使用极短固定文本；
- 检查模型响应、JSON 格式和必需字段；
- 展示密钥、模型名、余额、限流、超时等错误。

---

## 6.8 Fast Note Sync

### 6.8.1 接口边界

Fast Note Sync 当前按以下内容新建或覆盖文件：

```text
目标路径 + 文件名 + Markdown 内容
```

首版不依赖唯一 noteId，不跟踪用户在 Obsidian 中手动移动或改名后的文件。

### 6.8.2 同步内容

设置中提供：

- 默认：仅同步整理后的 Markdown；
- 可选：在最终笔记中同时附带原始转写文本。

不要求同步音频附件。

### 6.8.3 文件名

- LLM 生成自然标题；
- 同步时传入什么文件名，就写入什么文件名；
- 对文件系统非法字符做清洗；
- 同一路径同名时自动追加时间，例如：

```text
AI时代的学习方式-2026-07-12-1132.md
```

### 6.8.4 重新同步

- 修改标题或类型后再次同步，按当前路径和文件名创建新文件；
- 旧笔记保留；
- 不删除、不移动、不覆盖旧路径中的旧文件；
- 用户可选择默认同步或“另存为新笔记”，两者在当前接口下均表现为新路径/新文件写入。

### 6.8.5 测试连接

Fast Note Sync 设置提供独立测试：

- 验证地址与认证；
- 推荐写入一个临时测试 Markdown；
- 如 API 支持，测试结束后删除测试文件；不支持删除时明确提示用户测试文件名。

---

## 6.9 处理任务与队列

### 6.9.1 单任务串行

- 同一时间只处理一条录音；
- 其他任务进入等待队列；
- 避免 PWA 同时上传多个长音频和重复消耗 API。

### 6.9.2 处理阶段

```text
pending
waiting_network
uploading_asr
transcribing
organizing
syncing
success
failed
cancelled
```

### 6.9.3 分阶段持久化

每阶段完成后立即保存结果：

- ASR 成功后保存原始转写；
- LLM 成功后保存标题和 Markdown；
- 同步成功后保存路径、文件名、同步时间；
- 后续步骤失败时无需重新执行已成功步骤，除非用户主动选择从头重试。

### 6.9.4 自动重试

采用自动重试 + 手动重试：

自动重试：

- 网络超时；
- 临时 DNS / 连接错误；
- HTTP 429；
- HTTP 5xx。

停止自动重试并提示：

- API Key 错误；
- 余额不足；
- 模型不存在；
- 请求参数错误；
- 音频格式不支持；
- Fast Note Sync 认证失败。

建议默认最多自动重试 3 次，采用指数退避。

### 6.9.5 取消任务

- 用户可以取消当前处理；
- 使用 AbortController 终止当前请求；
- 已保存的阶段结果保留；
- 任务回到可手动继续的状态。

---

## 6.10 网络策略

设置项：

- 任何网络；
- 仅 Wi-Fi；
- 无网络时等待；
- 网络恢复后自动继续 / 仅提示用户。

默认建议：

- 任何网络；
- 无网络时等待；
- 网络恢复后自动继续，但处理页面仍应提示 PWA 需要保持前台。

注意：浏览器无法在所有设备上可靠识别真实 Wi-Fi 类型。实现时应根据 Network Information API 支持情况降级；不支持时只判断在线/离线，并在 UI 中说明限制。

---

## 6.11 数据保留

### 6.11.1 音频保留策略

设置可选：

- 同步成功后立即删除；
- 保留 7 天；
- 保留 30 天；
- 永久保留。

### 6.11.2 文本保留策略

原始转写和整理后的 Markdown 默认都保存在本地。设置可选：

- 保留 7 天；
- 保留 30 天；
- 永久保留。

文本清理不影响已写入 Obsidian 的文件。

### 6.11.3 清理任务

- App 启动时执行一次过期清理检查；
- 不依赖后台定时任务；
- 删除前检查任务是否仍在处理或失败待重试。

---

## 6.12 通知

仅在以下情况发送系统通知：

- 处理成功并写入 Obsidian；
- 处理失败，需要用户操作。

不在 ASR、LLM、同步每个阶段分别通知。

通知权限应在用户首次开启自动处理或主动启用通知时申请，而不是首次打开即申请。

---

## 6.13 备份与恢复

提供手动导出备份包。

备份内容：

- 本地录音及分片；
- 原始转写；
- 整理后的 Markdown；
- 类型配置；
- 路径、模板、提示词和标签；
- App 设置；
- 任务状态和元数据。

不导出：

- ASR API Key；
- LLM API Key；
- Fast Note Sync 密钥或 Token。

建议格式：ZIP，包含 `manifest.json`、配置 JSON、文本文件和音频目录。

提供导入备份包能力，遇到 ID 冲突时生成新本地 ID。

---

## 6.14 主题与视觉

- 浅色 / 深色自动跟随系统；
- 不提供手动主题切换；
- 风格：克制、轻量、圆角卡片、低饱和背景、强对比主按钮；
- 录音状态使用红色强调；
- 状态颜色仅作为辅助，必须同时显示文字；
- 不使用复杂波形动画；
- 动画时长克制，支持 `prefers-reduced-motion`。

---

## 7. 设置页面结构

### 7.1 录音与处理

- 录音结束后自动处理；
- 默认类型；
- 网络策略；
- 网络恢复行为；
- 音频保留期限；
- 文本保留期限；
- 是否在笔记中附带原始转写；
- 通知开关。

### 7.2 模型服务

- ASR 配置；
- 全局默认 LLM；
- Fast Note Sync；
- 每项独立测试连接。

### 7.3 笔记类型

- 类型列表；
- 新增 / 编辑 / 删除 / 排序；
- 常用类型；
- 类型级 LLM 覆盖。

### 7.4 数据

- 存储使用量；
- 清理已过期数据；
- 导出备份；
- 导入备份；
- 清空全部本地数据。

---

## 8. 数据模型建议

### 8.1 Recording

```ts
interface Recording {
  id: string;
  createdAt: string;
  updatedAt: string;
  typeId: string;
  durationMs: number;
  mimeType: string;
  chunkIds: string[];
  recovered: boolean;
  interrupted: boolean;
  localTitle: string;
  generatedTitle?: string;
  transcript?: string;
  markdown?: string;
  status: ProcessingStatus;
  currentStage?: string;
  progress?: number;
  retryCount: number;
  lastError?: AppError;
  syncedPath?: string;
  syncedFilename?: string;
  syncedAt?: string;
  audioDeleteAfter?: string;
  textDeleteAfter?: string;
}
```

### 8.2 AudioChunk

```ts
interface AudioChunk {
  id: string;
  recordingId: string;
  index: number;
  createdAt: string;
  blob: Blob;
  size: number;
}
```

### 8.3 NoteType

```ts
interface NoteType {
  id: string;
  name: string;
  icon?: string;
  order: number;
  isFavorite: boolean;
  isDefault: boolean;
  obsidianPath: string;
  prompt: string;
  filenameTemplate: string;
  markdownTemplate: string;
  tags: string[];
  llmConfigId?: string;
}
```

### 8.4 ProviderConfig

```ts
interface ProviderConfig {
  id: string;
  kind: 'asr' | 'llm' | 'fast-note-sync';
  preset: string;
  name: string;
  baseUrl: string;
  model?: string;
  extraHeaders?: Record<string, string>;
  timeoutMs: number;
  enabled: boolean;
}
```

API Key 单独保存，不进入普通导出对象。

### 8.5 AppSettings

```ts
interface AppSettings {
  autoProcess: boolean;
  defaultTypeId?: string;
  rememberLastType: boolean;
  lastTypeId?: string;
  networkPolicy: 'any' | 'wifi';
  resumeWhenOnline: boolean;
  includeTranscriptInNote: boolean;
  audioRetention: 'immediate' | '7d' | '30d' | 'forever';
  textRetention: '7d' | '30d' | 'forever';
  notificationsEnabled: boolean;
  defaultAsrConfigId?: string;
  defaultLlmConfigId?: string;
  fastNoteSyncConfigId?: string;
}
```

---

## 9. 技术架构建议

### 9.1 前端

- React；
- TypeScript；
- Vite；
- PWA / Service Worker；
- React Router；
- IndexedDB，推荐 Dexie；
- 状态管理可用 Zustand；
- CSS Variables + `prefers-color-scheme`；
- Web App Manifest；
- MediaRecorder；
- Screen Wake Lock API；
- Notification API；
- Web Crypto API。

### 9.2 模块划分

```text
src/
├─ features/recording
├─ features/audio-library
├─ features/processing-queue
├─ features/note-types
├─ features/providers
├─ features/sync
├─ features/backup
├─ pages/home
├─ pages/library
├─ pages/recording-detail
├─ pages/settings
├─ db
├─ services/asr
├─ services/llm
├─ services/fast-note-sync
└─ shared
```

### 9.3 Provider Adapter

所有服务通过适配器隔离：

```ts
interface AsrAdapter {
  test(config: AsrConfig): Promise<TestResult>;
  transcribe(audio: Blob, config: AsrConfig, signal?: AbortSignal): Promise<string>;
}

interface LlmAdapter {
  test(config: LlmConfig): Promise<TestResult>;
  organize(input: OrganizeInput, config: LlmConfig, signal?: AbortSignal): Promise<OrganizeResult>;
}

interface NoteSyncAdapter {
  test(config: SyncConfig): Promise<TestResult>;
  write(input: SyncInput, config: SyncConfig, signal?: AbortSignal): Promise<SyncResult>;
}
```

### 9.4 API Key 保存

PWA 无法达到 Android Keystore 的安全等级。

首版建议：

- API Key 只保存在本机浏览器；
- 使用 Web Crypto 加密后存储；
- 加密密钥可由用户设置的本地解锁密码派生，或明确提示“个人设备使用”；
- 不写入源码、Service Worker 缓存、日志、备份包；
- UI 默认遮挡，仅允许主动显示或替换。

---

## 10. 错误分类

统一错误结构：

```ts
interface AppError {
  code: string;
  category: 'permission' | 'network' | 'auth' | 'quota' | 'validation' | 'format' | 'storage' | 'server' | 'unknown';
  message: string;
  retryable: boolean;
  stage?: 'recording' | 'asr' | 'llm' | 'sync';
  httpStatus?: number;
  details?: string;
}
```

用户界面显示可操作信息，不直接展示完整技术堆栈。详情页可以提供“复制诊断信息”。诊断信息必须清除 API Key 和 Authorization Header。

---

## 11. UI 验收标准

### 11.1 主页

- 首屏明确看到类型和录音按钮；
- 最多 4 个常用类型 + 更多；
- 最近录音固定显示 2 条；
- 录音开始后按钮和文字状态清楚；
- 录音完成后自动滚动到最新卡片；
- 最新卡片高亮 2 秒；
- 不出现波形动画。

### 11.2 列表

- 卡片信息不拥挤；
- 常用操作直接显示；
- 删除在更多菜单；
- 状态不仅依赖颜色；
- 可按状态筛选。

### 11.3 详情页

- 音频、原始转写、Markdown 和操作分区明确；
- 文本可编辑；
- 重要危险操作有确认；
- 错误和重试入口清晰。

### 11.4 深色模式

- 跟随系统自动切换；
- 主按钮、录音红色、状态标签满足基本对比度；
- 卡片层级仍清楚。

---

## 12. 功能验收标准

### 12.1 录音

- 支持开始、暂停、继续、完成；
- 30 分钟录音在目标手机上可完成并保存；
- 每约 5 秒分片持久化；
- 刷新后可恢复已持久化内容；
- 中断时保存已录部分；
- 存储失败时停止并保留已有分片。

### 12.2 处理

- 单任务串行；
- 每阶段结果持久化；
- 可取消、重试和从失败阶段继续；
- 网络临时错误自动重试；
- 配置错误不重复消耗 API。

### 12.3 同步

- 能按类型路径写入 Markdown；
- 能生成自然标题文件名；
- 同名自动追加时间；
- 可选附带原始转写；
- 修改类型后可按新路径重新同步，旧文件保留。

### 12.4 配置

- ASR、LLM、Fast Note Sync 分别可测试；
- 类型可以新增、编辑、删除、排序；
- 类型可以覆盖全局 LLM；
- API Key 不出现在普通备份中。

---

## 13. 开发阶段建议

### 阶段 1：录音与本地列表

- PWA 框架、主题、导航；
- MediaRecorder；
- 5 秒分片；
- IndexedDB；
- 暂停 / 继续；
- 异常恢复；
- 列表和详情页；
- 本地播放与删除。

### 阶段 2：类型与模板

- 类型 CRUD；
- 常用类型与更多抽屉；
- 默认类型；
- 路径、提示词、模板、标签和文件名规则。

### 阶段 3：ASR 与 LLM

- StepAudio 适配器；
- OpenAI 兼容 ASR；
- OpenAI 兼容 LLM；
- 测试连接；
- 严格 JSON 输出解析；
- 详情页编辑和重新整理。

### 阶段 4：Fast Note Sync

- 写入适配器；
- 测试连接；
- 文件名清洗；
- 同名时间后缀；
- 重新同步与另存为。

### 阶段 5：队列与可靠性

- 单任务队列；
- 自动重试；
- 网络等待；
- 取消任务；
- 通知；
- 保留策略；
- 手动备份和恢复。

### 阶段 6：目标设备验证

- 一加 Android + Chrome / Edge；
- 安装到桌面；
- 30 分钟录音；
- 刷新恢复；
- 弱网 / 断网；
- 深色模式；
- CORS；
- StepAudio `webm/opus` 兼容性；
- Fast Note Sync 完整链路。

---

## 14. 必须优先验证的技术风险

1. **StepAudio 浏览器直连 CORS**：若接口不允许浏览器跨域，纯 PWA 无法直接调用。
2. **Fast Note Sync CORS**：必须允许 PWA 来源访问。
3. **`webm/opus` 兼容性**：确认 StepAudio 接受编码和容器。
4. **API Key 安全**：PWA 只能做到个人设备下的合理保护，不能视为绝对安全。
5. **前台限制**：录音和处理时切后台、锁屏或系统省电可能冻结页面。
6. **Wake Lock 兼容性**：不支持时需要提示用户保持屏幕点亮。
7. **浏览器存储清理**：用户清理站点数据会丢失本地录音，需强调备份。
8. **通知兼容性**：PWA 通知权限和表现因浏览器而异。
9. **Network Information API**：仅 Wi-Fi 策略不可在所有设备可靠实现。

若 CORS 成为硬性阻塞，优先采用 Capacitor 封装现有 React 项目，而不是立即建设独立后端。

---

## 15. 首版完成定义（Definition of Done）

首版完成必须满足：

- 安装到 Android 桌面后可以正常打开；
- 可以选择类型并录制、暂停、继续、完成；
- 录音分片可靠保存，刷新后能恢复；
- 音频列表和详情页可正常查看、播放和删除；
- StepAudio 可完成真实中文音频转写；
- LLM 能按类型提示词生成标题和 Markdown；
- Fast Note Sync 能写入指定 Obsidian 路径；
- 同名文件不会覆盖旧笔记；
- 失败任务可明确定位并重试；
- 自动处理、网络等待和通知可用；
- 深色模式跟随系统；
- 可以导出不含 API Key 的备份包；
- 在目标手机上完成至少一次 30 分钟录音和完整处理链路测试。

