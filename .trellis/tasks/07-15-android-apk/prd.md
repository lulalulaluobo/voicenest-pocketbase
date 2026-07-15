# 原生 Android APK 封装 PRD

## 背景

声笺已作为 PWA 在生产环境验证。用户需要一个可直接安装的 Android 应用，同时必须能把现有 PWA 的完整备份迁移进来，避免本地录音、设置和凭据丢失。

## 目标

- 使用 Capacitor 8 将现有 React PWA 封装成 Android 调试 APK。
- 应用包名为 `fun.lucc.voicenest`，显示名为“声笺”。
- 在 Android 真机上验证录音、重启后的本地数据保留，以及 ZIP 完整备份导入。
- 验证 ASR、LLM、Obsidian 同步与公众号草稿流程；公众号 Worker 不降低 Cloudflare Access 保护。

## 非目标

- 不重写为 Kotlin/Jetpack Compose。
- 不发布 Google Play、不创建发布签名包。
- 不在 APK 内置 ASR/LLM/Obsidian/公众号的密钥或 Token。
- 不新增原生文件保存、后台录音、自动更新或推送能力。

## 验收标准

1. 可生成并安装 `app-debug.apk`。
2. 首次录音时 Android 显示并接受麦克风授权；录音可停止、播放及继续使用原有的可跳转音频。
3. 重启应用后录音与文本仍存在；从 PWA 导出的 ZIP 可在 APK 中导入并恢复记录、音频与设置。
4. Android 壳运行时不暴露任何预配置凭据；所有配置仍由用户在设置页输入或从备份恢复。
5. 公众号请求只在确认 Capacitor 实际 Origin 后为该 Origin 增加精确 CORS 放行，并保留 Cloudflare Access；无法完成登录或 Cookie 传递时，明确作为阻断项报告，不以弱化鉴权换取通过。
