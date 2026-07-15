# 全量备份恢复契约

## 1. Scope / Trigger

当功能需要将 VoiceNest 的浏览器本地数据迁移到新设备或 Android WebView 时，必须通过 `src/lib/backup.ts` 生成或读取 ZIP。该功能跨越设置页、`localStorage`、Dexie 的 `recordings`/`audioChunks` 两张表，属于数据恢复信任边界。

## 2. Signatures

```ts
export async function createFullBackup(): Promise<Blob>
export async function readFullBackup(file: Blob): Promise<FullBackup>
export async function replaceLocalData(backup: FullBackup): Promise<void>
```

设置页必须按顺序调用：`readFullBackup(file)` → 用户确认 → `replaceLocalData(backup)`。不得绕过读取校验直接写入数据库。

## 3. Contracts

- 格式名固定为 `voicenest-backup`，格式版本固定为 `2`。
- ZIP 必须包含 `manifest.json`、`settings.json`、`recordings.json` 与 `audio/<recordingId>/<chunkId>.bin`。
- `settings.json` 只允许 `vn_*` 键，值必须是字符串；它包含 ASR/LLM API Key 与 Obsidian Token。
- `recordings.json` 保存完整 `Recording` 字段；音频文件保存原始 `AudioChunk.blob` 字节，不转码。
- `replaceLocalData()` 只删除并恢复 VoiceNest 自己的 `vn_*` 设置和两张 Dexie 表，不触碰其他站点/应用数据。

## 4. Validation & Error Matrix

| 条件 | 结果 |
| --- | --- |
| ZIP 缺少 JSON 文件、格式名或版本不匹配 | `readFullBackup()` 抛出错误，不修改本地数据。 |
| 设置键不是 `vn_*` 或值不是字符串 | 抛出“备份设置无效”，不修改本地数据。 |
| 录音字段缺失、状态未知或 ID 重复 | 抛出“录音清单无效”，不修改本地数据。 |
| 音频路径/ID 重复、找不到音频、字节数不匹配、录音不存在 | 抛出音频清单错误，不修改本地数据。 |
| 用户取消确认 | 不调用 `replaceLocalData()`。 |
| 所有校验通过且用户确认 | 清空两张 VoiceNest 表与全部 `vn_*` 键，再写入完整备份。 |

## 5. Good / Base / Bad Cases

- Good：包含配置、凭据、带音频的录音、转写、整理文章和公众号草稿字段的 ZIP，恢复后音频 Blob 字节相同。
- Base：`isAudioCleared: true` 的记录没有音频文件，仍恢复其文本和状态。
- Bad：录音 ID 重复或状态为未知值；导入必须在清库前失败。

## 6. Tests Required

`src/lib/backup.test.ts` 必须覆盖：

1. 设置、Token、录音文本和音频 Blob 的完整往返。
2. 仅保留文本、无音频分片的录音。
3. 重复录音 ID、缺失必填字段、未知处理状态均被拒绝。
4. 读取无效备份后，已有 Dexie 数据和 `vn_*` 设置保持不变。

## 7. Wrong vs Correct

### Wrong

```ts
await replaceLocalData(await readFullBackup(file))
```

这会在没有用户确认的情况下替换当前数据。

### Correct

```ts
const backup = await readFullBackup(file)
if (window.confirm('将删除当前全部本地数据并完整恢复备份。')) {
  await replaceLocalData(backup)
}
```

先完整校验，再由用户明确确认，最后执行不可逆恢复。
