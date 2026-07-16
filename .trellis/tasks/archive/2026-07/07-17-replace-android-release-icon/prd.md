# 生成 Android 图标并替换 Release APK

## Goal

为 VoiceNest 生成适合 Android 启动器的小尺寸图标，替换默认 Capacitor 图标，重新构建调试 APK，并覆盖 GitHub `v1.7.0` Release 的 APK 附件。

## What I already know

- Android Manifest 使用 `@mipmap/ic_launcher` 与 `@mipmap/ic_launcher_round`。
- 当前资源是 Capacitor 默认 launcher 图标。
- APK 当前版本为 `versionCode 9`；每次新的前端交付必须递增该值。
- 本地 `workers/wechat-draft/wrangler.jsonc` 是测试资源配置，必须保持未提交。

## Requirements

- 生成无文字、适合圆形/自适应遮罩的 VoiceNest 图标。
- 用生成图替换所有启动器图标密度资源，保留现有 Manifest 与 adaptive icon XML 结构。
- 将 `versionCode` 递增至 10，构建 debug APK。
- 用新 APK 覆盖 GitHub `v1.7.0` Release 的附件，并保留其 debug 属性。

## Acceptance Criteria

- [x] 新图标在各 mipmap 密度目录存在，Manifest 引用不变。
- [x] 前端测试、Capacitor 同步和 Android `assembleDebug` 通过。
- [x] APK 内包名为 `fun.lucc.voicenest`，`versionCode=10`。
- [x] GitHub Release 的 APK 附件已替换。
- [x] 测试 Worker 配置未提交或上传。

## Out of Scope

- 不修改应用 UI、Cloudflare 资源、Access 配置或 Release 标签。
