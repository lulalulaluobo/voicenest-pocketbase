# 可拖动 WebM 音频实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让列表操作不换行，并让现有和新录制的 WebM 在应用内与导出后显示时长、支持拖动播放。

**Architecture:** 新建 `recording-audio` 作为唯一 Blob 入口：调用方按顺序从 IndexedDB 读取分片后传入；MP4 直接合并，WebM 用 `ts-ebml` 重建包含 Duration、SeekHead 和 Cues 的元数据，再接回原始媒体正文。所有播放与导出调用该入口，持久化模型不变。

**Tech Stack:** React 19、TypeScript、Dexie、Vitest、ts-ebml 3.0.2、原生 Blob/URL API。

## Global Constraints

- 保留 `MediaRecorder.start(5000)` 与分片恢复；不新增后端、数据库字段或 ZIP 功能。
- 仅 WebM 重封装；`audio/mp4` 原样返回。
- 读取或重封装失败时返回原始 Blob，保证用户仍可导出与播放。
- 同一录音的列表播放、详情播放与导出必须使用同一个入口。
- 无障碍名称保留为“下载音频”；列表主操作区不再显示“查看详情”。

## 开源调研

- 已克隆 `references/ts-ebml`（MIT，`c627468`）。
- 借鉴其 `Decoder → Reader → tools.makeMetadataSeekable` 流程：它以原始元数据、时长与 cue 点生成包含 Duration、SeekHead、Cues 的新元数据，再拼接原始 Cluster 正文。
- 不引入仅修 duration 的 `fix-webm-duration`，因为该库不生成 Cues，无法满足外部播放器可拖动的验收。

---

### Task 1: 建立统一的可 seek 音频 Blob

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/lib/recording-audio.ts`
- Create: `src/lib/recording-audio.test.ts`

**Interfaces:**
- Consumes: `Recording` 和已排序的 `Blob[]` 分片。
- Produces: `getRecordingAudioBlob(recording: Recording, parts: Blob[]): Promise<Blob>`。

- [x] **Step 1: 安装生产依赖**

Run: `npm install ts-ebml@3.0.2`

Expected: `package.json` 与 `package-lock.json` 记录 `ts-ebml` 及其依赖；不新增其他包。

- [x] **Step 2: 编写失败测试**

创建 `src/lib/recording-audio.test.ts`：

```ts
import { describe, expect, it, vi } from 'vitest'
import { getRecordingAudioBlob } from './recording-audio'

vi.mock('ts-ebml', () => ({
  Decoder: class { decode = vi.fn(() => [{ name: 'EBML' }]) },
  Reader: class {
    logging = true
    metadatas = [{ name: 'EBML' }]
    duration = 6000
    cues = [{ CueTrack: 1, CueClusterPosition: 12, CueTime: 0 }]
    metadataSize = 4
    read = vi.fn()
    stop = vi.fn()
  },
  tools: { makeMetadataSeekable: vi.fn(() => new Uint8Array([9, 9]).buffer) },
}))

const base = {
  id: 'audio-1', createdAt: '', updatedAt: '', typeId: 'idea', typeName: '随想',
  durationMs: 6000, chunkIds: [], status: 'ready' as const, recovered: false,
  interrupted: false, localTitle: '标题',
}

it('passes MP4 through without remuxing', async () => {
  const blob = await getRecordingAudioBlob({ ...base, mimeType: 'audio/mp4' }, [
    new Blob(['mp4'], { type: 'audio/mp4' }),
  ])
  expect(await blob.text()).toBe('mp4')
})

it('prepends seekable WebM metadata', async () => {
  const blob = await getRecordingAudioBlob({ ...base, mimeType: 'audio/webm;codecs=opus' }, [
    new Blob([new Uint8Array([1, 2, 3, 4, 5])], { type: 'audio/webm' }),
  ])
  expect([...new Uint8Array(await blob.arrayBuffer())]).toEqual([9, 9, 5])
})
```

- [x] **Step 3: 运行测试确认失败**

Run: `npm test -- src/lib/recording-audio.test.ts`  
Expected: FAIL，模块不存在。

- [x] **Step 4: 实现最小入口**

创建 `src/lib/recording-audio.ts`：

```ts
import { Decoder, Reader, tools } from 'ts-ebml'
import type { Recording } from '../domain/recording'

export async function getRecordingAudioBlob(recording: Recording, parts: Blob[]): Promise<Blob> {
  const raw = new Blob(parts, { type: recording.mimeType })
  if (!recording.mimeType.startsWith('audio/webm')) return raw

  try {
    const buffer = await raw.arrayBuffer()
    const reader = new Reader()
    reader.logging = false
    for (const element of new Decoder().decode(buffer)) reader.read(element)
    reader.stop()

    const metadata = tools.makeMetadataSeekable(reader.metadatas, reader.duration, reader.cues)
    return new Blob([metadata, buffer.slice(reader.metadataSize)], { type: recording.mimeType })
  } catch {
    return raw
  }
}
```

保持该函数为纯 Blob 转换，不读取数据库。每个调用方先执行 `getChunks(recording.id)`，再将 `chunks.map((chunk) => chunk.blob)` 传入入口，使其可用纯 Blob 单测。

- [x] **Step 5: 运行测试与构建**

Run: `npm test -- src/lib/recording-audio.test.ts && npm run build`  
Expected: 两项测试通过，TypeScript 能解析 `ts-ebml`。

- [x] **Step 6: 提交**

```bash
git add package.json package-lock.json src/lib/recording-audio.ts src/lib/recording-audio.test.ts
git commit -m "fix: 重封装 WebM 音频索引"
codegraph sync .
```

### Task 2: 复用入口并收紧列表操作

**Files:**
- Modify: `src/components/RecordingCard.tsx`
- Modify: `src/pages/RecordingDetailPage.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `getRecordingAudioBlob(recording, chunks.map(chunk => chunk.blob))`。
- Produces: 列表播放、详情播放、下载均使用 seekable Blob；同步卡片显示“重新整理”、下载图标和更多菜单。

- [x] **Step 1: 替换三处 Blob 拼接**

在 `RecordingCard.tsx` 中，播放和下载分别改为：

```ts
const chunks = await getChunks(recording.id)
const audioBlob = await getRecordingAudioBlob(recording, chunks.map((chunk) => chunk.blob))
```

用 `audioBlob` 创建 Object URL；删除两处直接 `new Blob(chunks.map(...))`。在 `RecordingDetailPage.tsx` 同样替换 URL 创建处，并使用 `recording.mimeType`，不再硬编码 `audio/webm`。

- [x] **Step 2: 调整同步卡片操作区**

同步状态分支删除“查看详情”按钮。下载按钮改为：

```tsx
<button className="action download-btn" onClick={handleDownloadClick} disabled={!canDownload} aria-label={canDownload ? '下载音频' : downloadLabel}>
  ⇩
</button>
```

在 `styles.css` 不作全局重构；为 `.action.download-btn` 添加 `flex: 0 0 42px;`，使“重新整理 / ⇩ / …”单行显示。详情入口继续由卡片点击和更多菜单提供。

- [x] **Step 3: 运行完整验证**

Run: `npm test && npm run build`  
Expected: 所有用例通过，生产构建成功。

- [ ] **Step 4: 进行真机验收**

在 Android Chrome 录制超过 10 秒并完成整理后：
1. 详情页显示真实时长，拖动进度条从目标位置继续播放。
2. 列表按钮单行显示。
3. 导出的 WebM 在手机播放器中显示时长且可跳转播放。

- [x] **Step 5: 提交**

```bash
git add src/components/RecordingCard.tsx src/pages/RecordingDetailPage.tsx src/styles.css
git commit -m "fix: 修复音频拖动与列表按钮布局"
codegraph sync .
```
