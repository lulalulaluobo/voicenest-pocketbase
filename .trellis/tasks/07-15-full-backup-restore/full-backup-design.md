# 全量数据备份与恢复设计

## 状态

已于 2026-07-15 经用户确认。

## 文件格式

使用 ZIP 容器，内部格式固定为：

```text
manifest.json
settings.json
recordings.json
audio/<recording-id>/<chunk-index>.bin
```

- `manifest.json`：格式名、格式版本、导出时间、录音数量、音频分片数量和每条分片的路径、字节数、MIME 类型。
- `settings.json`：全部 `vn_*` LocalStorage 项。凭据按用户要求明文保存。
- `recordings.json`：`Recording[]`，包含转写、整理正文和公众号草稿字段。
- `audio/`：按原始分片 Blob 导出，导入后恢复同一 `id`、索引、时间、大小和 MIME 类型，避免重新编码音频。

格式版本从 `2` 开始，以区别现有仅配置 JSON 备份的 `1.0`。

## 数据流

```text
LocalStorage + Dexie(records/chunks)
  → ZIP manifest/settings/records/audio
  → 下载

ZIP 文件
  → 完整读取并校验 manifest、JSON、分片清单和字节数
  → 用户确认
  → 清空 voice-inbox Dexie 与 vn_* 配置
  → Dexie 事务写回记录和音频分片
  → 写回配置并刷新
```

导入的破坏性操作只能发生在所有文件已经验证之后；验证或读取失败绝不清库。

## UI

保留设置页“备份与恢复”入口，替换原有仅配置 JSON 的说明和行为：

- 导出按钮显示全量 ZIP 的进度/处理中状态，并提示文件含 API Key 与 Token。
- 导入按钮仅接受 `.zip`。
- 校验通过后使用一次二次确认，明确“将删除当前所有录音、音频和设置，并用备份替换”。
- 成功显示恢复的录音数与音频分片数并刷新；失败显示原因且不修改本地数据。

## 实现边界

- 新增一个小型备份模块，集中处理 ZIP 格式、导入校验和 Dexie 恢复；设置页只负责文件选择、确认和提示。
- 复用已有 `recordingDb` 与 `AudioChunk`/`Recording` 类型，不复制数据库访问逻辑。
- ZIP 使用 `fflate`，不手写 ZIP 编码。它是纯 JavaScript 的浏览器 ZIP 库，提供异步和流式 ZIP API；已克隆至 `references/fflate`，重点参考其 `Zip`、`AsyncZipDeflate`、`Unzip` 与 `UnzipInflate` 用法。
- 浏览器最终仍需持有可下载的 ZIP Blob；超大备份受设备可用内存与存储空间限制。首版不伪造“无限大小”支持，失败时保留现有数据并提示用户释放空间后重试。

## 验证

- 单元测试：完整数据往返、保留 Blob 字节、无音频记录、缺失文件、错误版本。
- 数据安全：任何校验失败与用户取消确认均断言 Dexie 和 LocalStorage 未变。
- 手工：导出后导入到空浏览器 Profile；播放音频并查看转写、整理内容、公众号草稿状态与 API 配置。
