# 可拖动音频与列表操作设计

## 目标

修复录音列表操作按钮换行，并让 WebM 录音在应用内和导出后具备正确时长与可拖动播放能力。

## 已确认决策

- 列表主操作区不再显示“查看详情”：点击卡片和“…”菜单保留该入口。
- 下载使用仅图标的紧凑按钮；本次不实现 ZIP 备份、固定文件夹或新的下载完成提示。
- 继续每 5 秒写入 IndexedDB 分片，不牺牲异常恢复能力。
- 对完整 WebM 分片重封装，写入 Duration、SeekHead 与 Cues；MP4 保持原样。

## 实现边界

新增一个统一的可播放音频 Blob 入口：读取录音分片，WebM 时调用 `ts-ebml` 生成可 seek 的容器元数据，其他格式直接合并。列表播放、详情播放与导出均复用此入口；不修改既有 IndexedDB 数据，也不要求用户重录。

列表仅调整 `RecordingCard` 的操作区：已同步录音保留“重新整理”、下载图标和更多菜单。按钮保持可访问名称。

## 开源调研

已克隆 `references/ts-ebml`（MIT，commit `c627468`）。其 `makeMetadataSeekable` 会为 MediaRecorder WebM 写入时长、SeekHead 与 Cues，且附带验证原始录音有限时长与重封装后可 seek 的测试。

不采用仅追加 duration 的方案：它不能保证第三方播放器可根据索引拖动。也不采用关闭 timeslice 的方案：会破坏当前每 5 秒持久化与崩溃恢复设计。

## 验证

- 单元测试：MP4 直接合并，WebM 生成含 Duration 和 Cues 的可播放 Blob。
- 完整 `npm test` 与 `npm run build`。
- 手动：Android Chrome 录制超过 10 秒，详情页可拖动；导出文件在手机播放器中显示时长并可跳转播放。
