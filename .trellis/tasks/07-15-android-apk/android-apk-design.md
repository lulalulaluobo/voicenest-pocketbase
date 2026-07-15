# 原生 Android APK 封装设计

## 状态

2026-07-15：用户确认采用 Capacitor 8 原生壳方案，首版交付可侧载的调试 APK。

## 方案比较

| 方案 | 结论 | 原因 |
| --- | --- | --- |
| Capacitor 8 WebView 壳 | 采用 | 复用已验证的 React、Dexie、MediaRecorder 与 ZIP 备份，改动最小。 |
| Trusted Web Activity | 不采用 | 依赖在线站点，离线本地数据、录音授权与调试可控性较差。 |
| Kotlin 重写 | 不采用 | 会重做完整 UI 与数据层，超出当前目标。 |

## 架构与数据

```text
React / Vite 构建产物 (dist)
  → Capacitor Android WebView
  → navigator.mediaDevices + MediaRecorder + IndexedDB(Dexie)
  → 现有 LocalStorage 配置、ZIP 备份导入/导出
```

- 新增 Capacitor Core、Android 平台和 CLI，并生成 `android/` 工程。
- 原 PWA 继续是唯一业务实现；不增加平行的原生业务层或数据存储。
- `AndroidManifest.xml` 请求 `RECORD_AUDIO`。实际运行时由 WebView 的权限请求触发系统授权，必须在真机验证。
- 保持 `webDir: dist`；每次构建执行 Vite build 后使用 Capacitor 同步到 Android 工程。
- 使用现有 1024px PWA 图标作为后续 Android 图标源；若 Capacitor 资源生成工具要求不同源文件，再仅补最小必要的资源。

## 服务与安全边界

- API Key、Obsidian Token、公众号地址均继续保存在用户的 Web 本地存储，或从用户选择的 ZIP 恢复；不写入原生工程、构建变量或 Git。
- 现有公众号 Worker 只接受 `https://obvoice.lucc.fun`。Capacitor Android 通常以本地 HTTPS Origin 运行，但具体 Origin 以真机网络请求为准。
- 仅在确认实际 Origin 后，把该单一 Origin 加入 Worker CORS allowlist 与测试；Cloudflare Access、服务端密钥和公众号 IP 白名单保持原样。若 Access Cookie 无法在 WebView 中传递，则停止在该点报告，而不增加服务 Token 或取消 Access。

## 最小 UI/PWA 修订

- 补齐 Manifest 的 `id`、`start_url`、`scope`。
- 补齐 `mobile-web-app-capable` 与 Apple Web App meta 标签。
- 不改动现有页面布局；它已经有 `100dvh`、安全区与 Service Worker 更新提示。

## 验证与交付

1. 自动：现有 `npm test`、`npm run build`，再执行 Capacitor 同步与 Gradle `assembleDebug`。
2. 真机：安装 APK，授权麦克风，录制约十秒，停止、播放、跳转进度，重启后检查记录。
3. 迁移：在 PWA 导出完整 ZIP，在 APK 选择该文件导入，检查记录、音频、转写、整理内容和配置。
4. 连接：按用户已有配置分别测试 ASR/LLM/Obsidian；登录 Cloudflare Access 后测试公众号预览/草稿。
5. 交付物：`android/app/build/outputs/apk/debug/app-debug.apk`。

## 参考

- 已克隆忽略目录 `references/capacitor` 的 `ionic-team/capacitor`（8.4.2）。重点参考 Android 模板 `AndroidManifest.xml`、`MainActivity` 与 CLI Android 检查实现。
