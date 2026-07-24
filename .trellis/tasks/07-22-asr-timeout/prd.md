# 延长 ASR 请求超时

## Goal

将未设置自定义值时的 ASR 请求超时从 30 秒延长到 15 分钟，避免长录音被客户端主动取消。

## Requirements

* 默认超时为 900000 毫秒。
* 调用方显式传入 `timeoutMs` 时保持原有优先级。
* 不增加音频分段、服务端代理或新的设置项。

## Acceptance Criteria

* [x] 未配置超时时，ASR 请求的中止计时器为 15 分钟。
* [x] 已配置超时时，仍使用配置值。
* [x] ASR 客户端测试和全量测试通过。

## Technical Notes

* 现场错误 `signal is aborted without reason` 与 `src/lib/asr.ts` 中 30 秒 `AbortController` 计时器对应。
* v1.0.9 已发布；GCSB 部署镜像 `lulalulaluobo/voicenest:2c3b28b`，健康检查通过。
