# 音频下载 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在录音列表卡片中下载仍保存在本地的音频，并以 LLM 生成的笔记标题命名。

**Architecture:** 复用已持久化在 IndexedDB 中的分片与 `Recording.localTitle`：纯函数根据标题和实际 MIME 生成安全文件名；卡片点击时合并分片为 Blob，使用原生 Object URL 和 `<a download>` 保存。下载不会写入数据库或改变处理状态。

**Tech Stack:** React 19、TypeScript、Dexie、Vitest、浏览器 Blob/URL/HTMLAnchorElement API。

## Global Constraints

- 不增加依赖、后端、数据库字段或迁移；LLM 成功后已写入 `Recording.localTitle` 的标题是唯一命名来源。
- 仅在 `recording.summary` 存在且 `recording.isAudioCleared` 不为真时允许下载；按钮须说明其禁用原因。
- 复用录音的 `mimeType` 作为 Blob 类型；`audio/mp4` 下载为 `.m4a`，其余当前支持的录音 MIME 下载为 `.webm`。
- 保持原有卡片点击导航、播放、处理、菜单与删除行为不变。
- 每次提交使用中文信息，提交后运行 `codegraph sync .`。

## 开源调研

- 已克隆 `references/FileSaver.js`（eligrey/FileSaver.js，commit `cea522b`）作为客户端 Blob 保存参考。
- 借鉴：Blob URL 与锚点下载的生命周期，以及 Safari/iOS 必须由用户交互触发的约束。
- 不引入：该项目的兼容层与依赖。当前目标浏览器均支持原生 Blob 和 `download` 属性，直接使用原生 API 的改动更小。已知限制：iOS Safari 可能打开音频供用户分享而非写入下载目录。

---

### Task 1: 安全下载文件名

**Files:**
- Modify: `src/lib/audio-mime.ts`
- Modify: `src/lib/audio-mime.test.ts`

**Interfaces:**
- Consumes: `title: string`、`mimeType: string`。
- Produces: `getAudioDownloadFilename(title: string, mimeType: string): string`，供列表卡片设置 `HTMLAnchorElement.download`。

- [ ] **Step 1: 编写失败测试**

在 `src/lib/audio-mime.test.ts` 的 import 中加入 `getAudioDownloadFilename`，并在现有 `describe` 中增加：

```ts
it('uses a safe LLM title and the matching audio extension', () => {
  expect(getAudioDownloadFilename('会议/讨论：Q3?', 'audio/mp4;codecs=mp4a.40.2')).toBe('会议_讨论_Q3_.m4a')
  expect(getAudioDownloadFilename('  ', 'audio/webm;codecs=opus')).toBe('未命名录音.webm')
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- src/lib/audio-mime.test.ts`  
Expected: FAIL，提示 `getAudioDownloadFilename` 尚未导出。

- [ ] **Step 3: 添加最小实现**

在 `src/lib/audio-mime.ts` 的 `selectAudioMime` 后增加：

```ts
export function getAudioDownloadFilename(title: string, mimeType: string): string {
  const safeTitle = title.trim().replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_') || '未命名录音'
  const extension = mimeType.startsWith('audio/mp4') ? 'm4a' : 'webm'
  return `${safeTitle}.${extension}`
}
```

不要新增独立工具文件：此函数与现有 MIME 决策属于同一职责，且只有一处调用。

- [ ] **Step 4: 运行文件级测试确认通过**

Run: `npm test -- src/lib/audio-mime.test.ts`  
Expected: PASS，全部 `selectAudioMime` 与下载文件名断言通过。

- [ ] **Step 5: 提交该可测试单元**

```bash
git add src/lib/audio-mime.ts src/lib/audio-mime.test.ts
git commit -m "feat: 生成安全的音频下载文件名"
codegraph sync .
```

### Task 2: 在录音列表卡片触发原生下载

**Files:**
- Modify: `src/components/RecordingCard.tsx`

**Interfaces:**
- Consumes: `getChunks(recording.id)`、`recording.mimeType`、`recording.summary`、`recording.isAudioCleared`、`getAudioDownloadFilename(recording.localTitle, recording.mimeType)`。
- Produces: 列表卡片中可访问、可禁用的“下载音频”按钮；下载为本地音频文件，不修改 IndexedDB。

- [ ] **Step 1: 在卡片中加入下载可用状态和点击处理**

在 `src/components/RecordingCard.tsx` 导入：

```ts
import { getAudioDownloadFilename } from '../lib/audio-mime'
```

在 `isWorking` 声明之前加入：

```ts
const canDownload = Boolean(recording.summary) && !recording.isAudioCleared
const downloadLabel = recording.isAudioCleared ? '音频已清理' : recording.summary ? '⇩ 下载' : '整理后下载'

const handleDownloadClick = async (e: React.MouseEvent) => {
  e.stopPropagation()
  const chunks = await getChunks(recording.id)
  if (!chunks.length) {
    alert('没有可下载的音频分片')
    return
  }

  const url = URL.createObjectURL(new Blob(chunks.map((chunk) => chunk.blob), { type: recording.mimeType }))
  const link = document.createElement('a')
  link.href = url
  link.download = getAudioDownloadFilename(recording.localTitle, recording.mimeType)
  document.body.append(link)
  link.click()
  link.remove()
  // ponytail: iOS Safari 可能改为打开分享页；跨平台保存目录需更复杂的原生文件 API。
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}
```

- [ ] **Step 2: 在两种操作按钮分支中各加入同一下载按钮**

在同步状态和未同步状态的两个操作片段中、`more-btn` 之前各加入：

```tsx
<button
  className="action"
  onClick={handleDownloadClick}
  disabled={!canDownload}
  aria-label={canDownload ? '下载音频' : downloadLabel}
>
  {downloadLabel}
</button>
```

保留原有的播放、处理、详情、更多菜单和删除按钮；不修改 CSS。三枚弹性按钮加固定宽度更多按钮在当前 430px 容器内可容纳。

- [ ] **Step 3: 运行完整验证**

Run: `npm test && npm run build`  
Expected: 全部 Vitest 用例通过，TypeScript 与 Vite 生产构建无错误。

- [ ] **Step 4: 进行最小手动验证**

Run: `npm run dev -- --host 127.0.0.1`  
Expected: 在浏览器打开列表页后，已整理录音显示“⇩ 下载”，下载文件名为 LLM 标题加 `.webm` 或 `.m4a`；未整理录音显示禁用的“整理后下载”；已清理录音显示禁用的“音频已清理”；点击下载不跳转详情页。

- [ ] **Step 5: 提交功能**

```bash
git add src/components/RecordingCard.tsx
git commit -m "feat: 支持按笔记标题下载音频"
codegraph sync .
```
