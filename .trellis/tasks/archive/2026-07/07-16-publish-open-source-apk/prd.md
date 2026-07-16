# 发布开源仓库与 Android APK

## Goal

完成 VoiceNest 开源发布前审阅，补齐必要的 Git 忽略规则和 README 文档，将已提交代码推送到用户指定的 GitHub 仓库，并以当前 Android 调试 APK 创建 GitHub Release。

## What I already know

- 用户指定远程仓库：`https://github.com/lulalulaluobo/VoiceNest.git`，目标分支为 `main`。
- 当前 APK 已构建并验证，包名为 `fun.lucc.voicenest`，`versionCode` 为 9。
- 工作区已有未提交的测试 Worker 配置 `workers/wechat-draft/wrangler.jsonc`；它不得推送或提交。
- `.dev.vars` 等本地密钥文件不得读取、输出、提交或上传。
- GitHub 目标仓库为空且尚无 Release；采用 `v1.7.0` 作为首个发布标签。
- 已跟踪源码与全部 Git 历史的密钥特征扫描均未命中；生产依赖审计为 0 漏洞。
- Worker 已验证来源白名单、封面 MIME/5 MiB 限制、Markdown 禁止原始 HTML；未发现高风险问题。

## Requirements

- 审阅已跟踪代码与文档，重点检查敏感信息、开源部署说明和当前变更。
- 仅在确有缺漏时更新 `.gitignore` 与 `README.md`。
- 推送 `main` 到指定 GitHub 仓库。
- 创建或更新一个与当前应用版本匹配的 GitHub Release，并上传 `android/app/build/outputs/apk/debug/app-debug.apk`。

## Acceptance Criteria

- [x] 审阅结论记录，未发现待修复的高风险问题。
- [x] `.gitignore` 和 README 已按实际需要更新并验证。
- [x] 测试和生产构建通过，且 APK 存在。
- [x] `main` 已推送；Release 已包含 APK。
- [x] 本地测试 Worker 配置和所有密钥均未提交或上传。

## Review Results

- 已跟踪源码与 Git 历史的常见密钥特征扫描均未命中，生产依赖审计为 0 漏洞。
- Worker 的来源限制、封面 MIME/5 MiB 限制和 Markdown 原始 HTML 禁用均符合开源部署边界。
- Vite 保留一个既有的主包体积提示；它不阻塞本次发布，代码拆分不在本任务范围内。

## Out of Scope

- 不修改生产 Cloudflare 或微信公众号资源。
- 不上传 release 以外的构建产物。
- 不改变 APK 签名、安装到设备或发布应用商店。

## Planned Changes

- 在根 `.gitignore` 忽略 Android 签名与 Firebase 服务配置文件。
- 在 README 增加 GitHub Releases 的调试 APK 获取说明。
