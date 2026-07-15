# 全量数据备份与恢复实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 VoiceNest 的全部本地配置、凭据、录音、音频、转写和整理文章导出为 ZIP，并在确认后清库完整恢复。

**Architecture:** 新建 `src/lib/backup.ts` 统一持有 ZIP 格式、校验与恢复逻辑；设置页只负责触发下载、选择文件、二次确认和状态提示。使用 `fflate` 的 `zipSync`/`unzipSync` 生成标准 ZIP；文件会在浏览器内存中完成组装，因此失败时不触碰现有数据库。

**Tech Stack:** React、TypeScript、Dexie、Blob/File API、`fflate`、Vitest、fake-indexeddb。

## Global Constraints

- ZIP 明文包含 ASR/LLM API Key 与 Obsidian Token，仅限个人离线保存；UI 必须明确警示。
- 仅接受版本 `2` 的 `voicenest-backup` ZIP；不兼容旧的配置 JSON 导入。
- 导入必须先解析并校验完所有内容，再请求确认；取消或校验失败不得改变任何 `voice-inbox` 或 `vn_*` 数据。
- 用户确认后删除 `voice-inbox` 的两张表与全部 `vn_*` LocalStorage 项，再恢复备份；不做合并。
- 复用 `Recording`、`AudioChunk` 与 `recordingDb`，不重新编码音频。
- 浏览器 ZIP Blob 受设备可用内存/空间限制；失败只显示错误，不清除原数据。

## 文件结构

| 文件 | 责任 |
| --- | --- |
| `package.json`、`package-lock.json` | 添加 `fflate` 浏览器 ZIP 依赖。 |
| `src/lib/backup.ts` | 导出 ZIP、解析校验 ZIP、替换本地数据。 |
| `src/lib/backup.test.ts` | 验证 ZIP 往返、二进制 Blob、无音频记录和无损失败。 |
| `src/pages/SettingsPage.tsx` | 替换旧配置 JSON 的导入导出 UI 与处理函数。 |

---

### Task 1: 定义可验证的 ZIP 备份模块

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/lib/backup.ts`
- Create: `src/lib/backup.test.ts`

**Interfaces:**
- Consumes: `recordingDb`、`Recording`、`AudioChunk`、浏览器 `localStorage`、`fflate`。
- Produces: `createFullBackup()`、`readFullBackup()`、`replaceLocalData()`，供设置页调用。

- [ ] **Step 1: 安装 ZIP 依赖**

Run:

```bash
npm install fflate
```

Expected: `package.json` 的 `dependencies` 新增 `fflate`，lockfile 同步更新；不添加其他依赖。

- [ ] **Step 2: 编写失败测试，固定导入导出契约**

Create `src/lib/backup.test.ts`，使用现有 `fake-indexeddb` 设置和 `recordingDb.delete()/open()` 隔离数据库。测试先导入尚不存在的函数：

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { appendChunk, createRecording, getChunks, listRecordings, recordingDb } from './recording-db'
import { createFullBackup, readFullBackup, replaceLocalData } from './backup'

describe('full backup', () => {
  const values = new Map<string, string>()

  beforeEach(async () => {
    values.clear()
    vi.stubGlobal('localStorage', {
      get length() { return values.size },
      key: (index: number) => [...values.keys()][index] ?? null,
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
    })
    await recordingDb.delete()
    await recordingDb.open()
  })

  afterEach(async () => {
    await recordingDb.delete()
    vi.unstubAllGlobals()
  })

  it('round-trips settings, recordings, text and binary audio', async () => {
    localStorage.setItem('vn_asr', JSON.stringify({ apiKey: 'asr-secret' }))
    localStorage.setItem('vn_sync', JSON.stringify({ apiToken: 'obsidian-token' }))
    await createRecording({ id: 'r1', typeId: 'idea', typeName: '随想', mimeType: 'audio/webm', localTitle: '标题' })
    await recordingDb.recordings.update('r1', { transcript: '原始转写', summary: '# 整理文章', wechatStatus: 'drafted' })
    await appendChunk({ id: 'c1', recordingId: 'r1', index: 0, createdAt: '2026-07-15T00:00:00.000Z', blob: new Blob(['audio-bytes'], { type: 'audio/webm' }), size: 11 })

    const archive = await createFullBackup()
    await recordingDb.recordings.clear()
    await recordingDb.audioChunks.clear()
    localStorage.setItem('vn_asr', JSON.stringify({ apiKey: 'wrong-key' }))
    const parsed = await readFullBackup(archive)
    await replaceLocalData(parsed)

    expect(localStorage.getItem('vn_asr')).toContain('asr-secret')
    expect(localStorage.getItem('vn_sync')).toContain('obsidian-token')
    expect(await listRecordings()).toMatchObject([{ id: 'r1', transcript: '原始转写', summary: '# 整理文章', wechatStatus: 'drafted' }])
    expect(await (await getChunks('r1'))[0].blob.text()).toBe('audio-bytes')
  })
})
```

Add separate tests for: a record with `isAudioCleared: true` and zero chunks; a ZIP whose manifest lists a missing audio file; and an invalid version. For the invalid cases, seed `recordingDb` and `vn_asr`, call only `readFullBackup()`, assert it rejects, then assert the seeded data is unchanged.

- [ ] **Step 3: 运行测试确认失败**

Run:

```bash
npm test -- --run src/lib/backup.test.ts
```

Expected: FAIL，因为 `./backup` 尚不存在。

- [ ] **Step 4: 实现最小 ZIP 格式与导出**

Create `src/lib/backup.ts`：

```ts
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import type { AudioChunk, Recording } from '../domain/recording'
import { recordingDb } from './recording-db'

export const BACKUP_FORMAT = 'voicenest-backup'
export const BACKUP_VERSION = 2

interface AudioEntry {
  path: string
  id: string
  recordingId: string
  index: number
  createdAt: string
  size: number
  type: string
}

interface BackupManifest {
  format: typeof BACKUP_FORMAT
  version: typeof BACKUP_VERSION
  exportedAt: string
  recordingCount: number
  audioEntries: AudioEntry[]
}

export interface FullBackup {
  manifest: BackupManifest
  settings: Record<string, string>
  recordings: Recording[]
  chunks: AudioChunk[]
}

function vnSettings(): Record<string, string> {
  const entries: Array<[string, string]> = []
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index)
    if (key?.startsWith('vn_')) entries.push([key, localStorage.getItem(key) ?? ''])
  }
  return Object.fromEntries(entries)
}

function jsonFile(value: unknown): Uint8Array {
  return strToU8(JSON.stringify(value))
}

export async function createFullBackup(): Promise<Blob> {
  const recordings = await recordingDb.recordings.toArray()
  const chunks = await recordingDb.audioChunks.toArray()
  const audioEntries: AudioEntry[] = []
  const files: Record<string, Uint8Array> = {
    'settings.json': jsonFile(vnSettings()),
    'recordings.json': jsonFile(recordings),
  }
  for (const chunk of chunks) {
    const path = `audio/${chunk.recordingId}/${chunk.id}.bin`
    audioEntries.push({ path, id: chunk.id, recordingId: chunk.recordingId, index: chunk.index, createdAt: chunk.createdAt, size: chunk.size, type: chunk.blob.type })
    files[path] = new Uint8Array(await chunk.blob.arrayBuffer())
  }
  const manifest: BackupManifest = { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), recordingCount: recordings.length, audioEntries }
  files['manifest.json'] = jsonFile(manifest)
  return new Blob([zipSync(files, { level: 6 })], { type: 'application/zip' })
}
```

- [ ] **Step 5: 实现导入校验与替换恢复**

在同一模块添加：

```ts
function parseJson<T>(files: Record<string, Uint8Array>, path: string): T {
  const file = files[path]
  if (!file) throw new Error(`备份缺少 ${path}`)
  return JSON.parse(strFromU8(file)) as T
}

export async function readFullBackup(file: Blob): Promise<FullBackup> {
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()))
  const manifest = parseJson<BackupManifest>(files, 'manifest.json')
  if (manifest.format !== BACKUP_FORMAT || manifest.version !== BACKUP_VERSION) throw new Error('不支持的备份版本')
  const settings = parseJson<Record<string, string>>(files, 'settings.json')
  const recordings = parseJson<Recording[]>(files, 'recordings.json')
  if (!Array.isArray(recordings) || manifest.recordingCount !== recordings.length) throw new Error('录音清单无效')
  const chunks = manifest.audioEntries.map((entry) => {
    const bytes = files[entry.path]
    if (!bytes || bytes.byteLength !== entry.size) throw new Error(`备份缺少或损坏音频：${entry.path}`)
    return { id: entry.id, recordingId: entry.recordingId, index: entry.index, createdAt: entry.createdAt, blob: new Blob([bytes], { type: entry.type }), size: entry.size }
  })
  return { manifest, settings, recordings, chunks }
}

export async function replaceLocalData(backup: FullBackup): Promise<void> {
  await recordingDb.transaction('rw', recordingDb.recordings, recordingDb.audioChunks, async () => {
    await recordingDb.audioChunks.clear()
    await recordingDb.recordings.clear()
    await recordingDb.recordings.bulkPut(backup.recordings)
    await recordingDb.audioChunks.bulkPut(backup.chunks)
  })
  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index)
    if (key?.startsWith('vn_')) localStorage.removeItem(key)
  }
  Object.entries(backup.settings).forEach(([key, value]) => localStorage.setItem(key, value))
}
```

Before returning from `readFullBackup()`, add shape guards for every manifest entry (`path/id/recordingId/createdAt/type` must be non-empty strings, `index/size` must be non-negative finite numbers), ensure every setting key starts with `vn_`, and reject duplicate audio paths or duplicate chunk IDs. These checks are the sole import trust boundary.

- [ ] **Step 6: 运行模块测试与类型检查**

Run:

```bash
npm test -- --run src/lib/backup.test.ts
npm run build
```

Expected: 所有备份测试通过，TypeScript 与 Vite build 成功。

- [ ] **Step 7: 提交备份模块**

```bash
git add package.json package-lock.json src/lib/backup.ts src/lib/backup.test.ts
git commit -m 'feat: 支持全量 ZIP 备份恢复'
codegraph sync
```

### Task 2: 将设置页改为全量 ZIP 导入导出

**Files:**
- Modify: `src/pages/SettingsPage.tsx`

**Interfaces:**
- Consumes: `createFullBackup()`、`readFullBackup()`、`replaceLocalData()`。
- Produces: 设置页的 ZIP 导出、校验后确认恢复和用户可理解的状态提示。

- [ ] **Step 1: 在设置页引入备份模块与忙碌状态**

在已有 import 区加入：

```ts
import { createFullBackup, readFullBackup, replaceLocalData } from '../lib/backup'
```

在 `SettingsPage` state 中加入：

```ts
const [backupBusy, setBackupBusy] = useState(false)
```

- [ ] **Step 2: 用 ZIP 导出替换旧的脱敏 JSON 导出**

删除 `handleExportBackup` 中构造 `backupData` 与清空密钥的逻辑，替换为：

```ts
const handleExportBackup = async () => {
  setBackupBusy(true)
  try {
    const blob = await createFullBackup()
    const url = URL.createObjectURL(blob)
    const date = new Date().toISOString().slice(0, 10).replaceAll('-', '')
    const link = document.createElement('a')
    link.href = url
    link.download = `voicenest-backup-${date}.zip`
    link.click()
    URL.revokeObjectURL(url)
    alert('全量备份已开始下载。文件含 API Key 与 Token，请仅保存到可信位置。')
  } catch (error) {
    alert(`导出备份失败：${error instanceof Error ? error.message : '未知错误'}`)
  } finally {
    setBackupBusy(false)
  }
}
```

- [ ] **Step 3: 用“校验 → 确认 → 替换”替换旧 JSON 导入**

将 `handleImportBackup` 改为异步函数，删除旧的 `FileReader` 和“保留本地密钥”的合并逻辑：

```ts
const handleImportBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  setBackupBusy(true)
  try {
    const backup = await readFullBackup(file)
    const confirmed = window.confirm(`已校验备份：${backup.manifest.recordingCount} 条录音、${backup.manifest.audioEntries.length} 个音频分片。\n\n继续将删除当前全部录音、音频、设置和 API 凭据，并用备份完整替换。此操作不可撤销。`)
    if (!confirmed) return
    await replaceLocalData(backup)
    alert(`恢复完成：${backup.manifest.recordingCount} 条录音已恢复。应用将刷新。`)
    window.location.reload()
  } catch (error) {
    alert(`导入备份失败：${error instanceof Error ? error.message : '备份文件无效'}`)
  } finally {
    setBackupBusy(false)
  }
}
```

- [ ] **Step 4: 更新设置页文字与控件状态**

将卡片副标题改为“导出含录音、文本、提示词和凭据的 ZIP 全量备份；导入会完全替换本地数据”。警示文字改为“文件含 API Key、Obsidian Token 等敏感凭据，仅限个人离线保存”。将 input 改为 `accept=".zip,application/zip"`，两个按钮均在 `backupBusy` 时 `disabled`，导出按钮在处理中显示“正在导出…”，导入标签在处理中显示“正在导入…”。

- [ ] **Step 5: 进行浏览器手工验收**

1. 新建一条有音频、转写、整理文章和公众号草稿的录音，并确认 ASR/LLM/Obsidian 配置已填写。
2. 设置页导出 ZIP；用归档工具确认包含 `manifest.json`、`settings.json`、`recordings.json` 和 `audio/`。
3. 在浏览器清除网站数据或使用新的浏览器 Profile 后导入 ZIP，确认二次提示。
4. 确认录音可播放，文本完整，分类、提示词、API Key、Token 与公众号配置恢复。
5. 对损坏 ZIP 点击导入，确认错误提示出现且原数据没有变化。

- [ ] **Step 6: 运行全量检查并提交**

Run:

```bash
npm test
npm run build
git add src/pages/SettingsPage.tsx
git commit -m 'feat: 设置页支持全量数据备份'
codegraph sync
```

Expected: 测试和构建通过，提交仅包含设置页的备份交互。

## 最终验证

- [ ] `npm test` 通过。
- [ ] `npm run build` 通过。
- [ ] 真实导出 ZIP 后，在全新浏览器存储中可完整恢复。
- [ ] 任何导入校验失败、用户取消确认和导出失败均不清除现有数据。
- [ ] 记录最终测试结果到 `.trellis/tasks/07-15-full-backup-restore/check.jsonl`。
