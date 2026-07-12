# 阶段 1：录音与本地列表实施计划

> **面向执行者：** 按任务逐项完成；每项通过验证后才进行下一项。

**目标：** 交付可部署到 Vercel 的静态录音 PWA，在 Android Chrome 和 iPhone Safari 上把约 5 秒的音频分片写入 IndexedDB，并支持恢复、播放和删除。

**架构：** React 负责页面；原生 MediaRecorder 负责录音；Dexie 保存元数据和分片。录音先创建元数据，分片到达即写库，启动应用时恢复未完成条目。

**技术栈：** React、TypeScript、Vite、React Router、Dexie、vite-plugin-pwa、Vitest、fake-indexeddb、MediaRecorder、Wake Lock。

## 全局约束

- Vercel 只部署静态前端；不新增后端、Function、密钥、环境变量、转写或同步。
- MIME 由 `MediaRecorder.isTypeSupported()` 运行时选择，不能写死为 webm。
- 每约 5 秒持久化非空分片；写入失败即停止后续录音，但保留已写入分片。
- 只实现录音、本地列表、详情、播放、恢复、删除、主题和只读示例类型。
- 保持现有原型的页面结构；不加波形、类型 CRUD、后台任务或自动更新强刷。

## 文件结构

| 路径 | 职责 |
| --- | --- |
| `package.json`、`vite.config.ts`、`tsconfig*.json` | 构建、测试、PWA 配置。 |
| `src/main.tsx`、`src/App.tsx`、`src/styles.css` | 入口、路由壳、主题和原型风格。 |
| `src/domain/recording.ts` | 录音、分片和示例类型。 |
| `src/lib/audio-mime.ts`、`src/lib/recording-db.ts` | MIME 选择和 Dexie 存储。 |
| `src/hooks/use-recorder.ts` | 权限、MediaRecorder、计时、Wake Lock、分片写入。 |
| `src/components/*`、`src/pages/*` | 卡片、导航、类型选择和各页面。 |
| `src/lib/*.test.ts`、`src/test/setup.ts` | MIME 和 IndexedDB 验证。 |

## 任务 1：初始化静态 PWA 与测试环境

**文件：** 创建 `package.json`、`index.html`、`vite.config.ts`、`tsconfig*.json`、`public/icon.svg`、`src/main.tsx`、`src/App.tsx`、`src/styles.css`、`src/test/setup.ts`。

- [x] 安装 `react react-dom react-router-dom dexie` 与开发依赖 `@types/react @types/react-dom @vitejs/plugin-react fake-indexeddb typescript vite vite-plugin-pwa vitest`。
- [x] 配置 `VitePWA`：名称 `Voice Inbox`、`display: 'standalone'`、`registerType: 'prompt'`、主题色和 `public/icon.svg`。
- [x] 配置脚本 `dev: vite`、`build: tsc -b && vite build`、`test: vitest run`；测试 setup 为 `import 'fake-indexeddb/auto'`。
- [x] 创建入口：

```tsx
createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
)
```

- [x] 运行 `npm run build`；预期成功，`dist/` 有 manifest 和 Service Worker。
- [x] 提交：`feat: 初始化录音 PWA`。

## 任务 2：建立数据模型与 IndexedDB

**文件：** 创建 `src/domain/recording.ts`、`src/lib/recording-db.ts`、`src/lib/recording-db.test.ts`。

**接口：**

```ts
export type RecordingStatus = 'recording' | 'ready' | 'recovered' | 'interrupted'
export interface Recording { id: string; createdAt: string; updatedAt: string; typeId: string; typeName: string; durationMs: number; mimeType: string; chunkIds: string[]; status: RecordingStatus; recovered: boolean; interrupted: boolean; localTitle: string }
export interface AudioChunk { id: string; recordingId: string; index: number; createdAt: string; blob: Blob; size: number }
export async function createRecording(input: Pick<Recording, 'id' | 'typeId' | 'typeName' | 'mimeType' | 'localTitle'>): Promise<Recording>
export async function appendChunk(chunk: AudioChunk): Promise<void>
export async function finishRecording(id: string, durationMs: number, status: 'ready' | 'interrupted'): Promise<void>
export async function recoverIncompleteRecordings(): Promise<void>
export async function deleteRecording(id: string): Promise<void>
```

- [x] 先写两个失败测试：未完成录音恢复后仍有分片；删除录音后元数据与全部所属分片均不存在。
- [x] Dexie schema 使用：

```ts
this.version(1).stores({
  recordings: 'id, createdAt, status',
  audioChunks: 'id, recordingId, [recordingId+index]',
})
```

- [x] `appendChunk` 写入分片后追加分片 ID；`deleteRecording` 在一个 `rw` 事务删除录音和同一 `recordingId` 的分片；恢复函数将 `recording` 改为 `recovered`。
- [x] 运行 `npm test -- recording-db.test.ts && npm run build`；预期均成功。
- [x] 提交：`feat: 持久化本地录音分片`。

## 任务 3：实现 MIME 选择与录音 Hook

**文件：** 创建 `src/lib/audio-mime.ts`、`src/lib/audio-mime.test.ts`、`src/hooks/use-recorder.ts`。

**接口：**

```ts
export function selectAudioMime(isSupported: (mime: string) => boolean): string | undefined
export function useRecorder(): { state: RecorderState; elapsedMs: number; error: string | null; start(type: NoteType): Promise<void>; pause(): void; resume(): void; stop(): Promise<string | null>; clearError(): void }
```

- [x] 先写失败测试：优先 `audio/webm;codecs=opus`，仅支持 `audio/mp4` 时返回 mp4，均不支持时返回 `undefined`。
- [x] 实现候选顺序：

```ts
const AUDIO_MIME_CANDIDATES = [
  'audio/webm;codecs=opus', 'audio/webm',
  'audio/mp4;codecs=mp4a.40.2', 'audio/mp4',
]
```

- [x] `start` 检查安全上下文、`getUserMedia` 和 MediaRecorder，再创建录音元数据并调用 `recorder.start(5000)`；不支持 MIME 时不传 `mimeType`。
- [x] 非空 `dataavailable` Blob 立即 `appendChunk`；写入失败时显示中文错误、停止后续录音、保留已有分片。
- [x] `pause`/`resume` 调用录音器，计时仅累计实际录音时间；`stop` 等待最终分片后写 `ready`；音轨 `ended` 写 `interrupted`；Wake Lock 失败静默降级并在停止/卸载释放。
- [x] 运行 `npm test -- audio-mime.test.ts recording-db.test.ts && npm run build`；预期成功。
- [x] 提交：`feat: 支持分片录音与格式降级`。

## 任务 4：实现路由、视觉与首页录音

**文件：** 修改 `src/App.tsx`、`src/styles.css`；创建 `BottomNav`、`StatusBadge`、`TypePicker`、`HomePage`、`RecordingsPage`、`RecordingDetailPage`、`SettingsPage`。

- [x] App 启动仅调用一次 `recoverIncompleteRecordings()`，配置 `/`、`/recordings`、`/recordings/:recordingId`、`/settings` 四个路由。
- [x] `BottomNav` 只渲染录音、列表、设置三个 `NavLink`；`StatusBadge` 显示中文状态与颜色；`TypePicker` 只提供随想、日记、会议、项目四种示例类型。
- [x] CSS 以变量实现浅色与 `prefers-color-scheme: dark`；控件最小 44px；视觉对齐 HTML 原型但不复制其内联脚本。
- [x] 首页接通 `useRecorder`。按钮状态严格为开始、暂停、继续、完成；完成后刷新最近两条、滚动新卡片并高亮 2 秒；错误元素加 `role="alert"`。
- [x] 运行 `npm run build`；预期所有路由与页面可打包。
- [x] 提交：`feat: 搭建录音应用导航与界面`。

## 任务 5：实现列表、详情、播放与删除

**文件：** 修改数据库与列表/详情页面；创建 `src/components/RecordingCard.tsx`。

- [x] 导出 `listRecordings()`（按 `createdAt` 倒序）、`getRecording(id)` 与 `getChunks(recordingId)`（按 `index` 正序），并为两个排序行为添加 Vitest 断言。
- [x] 列表使用四个阶段 1 状态做前端筛选，卡片显示标题、时间、类型、时长、文字状态；空列表显示空状态。
- [x] 详情播放源使用：

```ts
const blob = new Blob(chunks.map((chunk) => chunk.blob), { type: recording.mimeType })
const url = URL.createObjectURL(blob)
```

- [x] 卸载时 `URL.revokeObjectURL(url)`。删除先调用 `window.confirm('删除本地录音及其音频分片？此操作无法撤销。')`，确认后 `deleteRecording` 并返回列表；缺失 ID 显示“录音不存在或已删除”。
- [x] 运行 `npm test && npm run build`；预期成功。
- [ ] 手动检查录音时刷新后出现“已恢复”，删除后卡片和分片均消失。
- [x] 提交：`feat: 提供本地录音列表与详情`。

## 任务 6：完成设置、更新保护、部署与验收

**文件：** 修改 `SettingsPage`、`App`、`vite.config.ts`；创建 `README.md`。

- [x] 设置页显示系统主题跟随；模型、同步、备份和类型管理明确标为后续阶段，不能存在可点击的假开关。
- [x] 使用 `virtual:pwa-register/react` 提示式更新；录音不是 idle 时不显示“立即更新”，不得调用 `skipWaiting` 或自动刷新。
- [x] README 写明 `npm install`、`npm run dev`、`npm run test`、`npm run build`，以及 Vercel 只托管静态产物、没有环境变量的边界。
- [x] 运行 `npm test && npm run build && git diff --check`；预期全部成功。
- [x] 已在 Vercel 创建静态项目并部署 HTTPS 生产地址：`https://codex-stage1-recording.vercel.app`。
- [ ] 真机在 Android Chrome 与 iPhone Safari 分别验证授权、录音控制、播放、刷新恢复、删除、桌面安装与深色模式。
- [ ] 提交：`feat: 完成阶段一录音 PWA`，随后执行 `codegraph sync`。

## 计划自检

- 录音、分片、恢复、列表、详情、播放、删除、PWA、主题、导航和双浏览器验收均有对应任务。
- 未包含转写、同步、类型 CRUD、密钥或后端。
- 接口、测试与数据状态在各任务中一致；不存在未完成标记或模糊占位。
