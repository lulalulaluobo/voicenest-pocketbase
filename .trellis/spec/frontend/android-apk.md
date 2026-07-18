# Android APK 封装契约

## 1. Scope / Trigger

当 VoiceNest 的 Web 前端需要生成 Android 调试 APK 或同步网页资源到原生工程时，必须使用 Capacitor Android 壳。业务逻辑仍在 `src/`；Android 工程不承载 API Key、Token 或第二套数据层。

## 2. Signatures

```bash
npm run build
npx cap sync android
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" \
ANDROID_HOME="$HOME/Library/Android/sdk" \
(cd android && ./gradlew assembleDebug)
```

交付物固定为 `android/app/build/outputs/apk/debug/app-debug.apk`。

## 3. Contracts

- `capacitor.config.json` 固定包含 `appId: "fun.lucc.voicenest"`、`appName: "声笺"`、`webDir: "dist"` 和 `server.androidScheme: "https"`。公众号请求走用户配置的 PocketBase 地址，不配置 Cloudflare Worker、Access 或 `allowNavigation` 白名单。
- Android WebView 的预期 Origin 为 `https://localhost`。FNS 请求统一经已配置的 PocketBase 同源代理转发；FNS 仅需提供手机可访问的 HTTPS 地址，无需为 `https://localhost` 或 VoiceNest 网页域名配置 CORS。
- `android/app/src/main/AndroidManifest.xml` 必须声明 `INTERNET`、`MODIFY_AUDIO_SETTINGS` 与 `RECORD_AUDIO`；Capacitor 对音频捕获会同时请求后两项。
- `MainActivity` 必须接受 Cookie 与第三方 Cookie、在页面完成时 `CookieManager.flush()`，并只在首次加载 `https://localhost` 时注销遗留 Service Worker 后重载；不得清空 WebView 数据、Dexie 或 Cookie。
- Android 内不注册新的 PWA Service Worker。设置页“公众号草稿箱”只展示 AppID/AppSecret 的保存和连通性测试；不得添加 Worker 授权 URL、`wechat-authorized` 回调或外部浏览器跳转。
- Android 构建每次交付新前端时必须递增 `android/app/build.gradle` 的 `versionCode`。
- Android WebView 不支持把 `blob:` 的 `<a download>` 写入文件；`FileDownload` 原生插件在 Android 10+ 写入 `Download/声笺`，旧版使用 `ACTION_CREATE_DOCUMENT` 选择位置。WebView 只能以 256 KiB Base64 块依次调用 `begin` → `append` → `finish`，不能传整份文件。网页端继续使用 `<a download>` 回退。
- 密钥只能由设置页输入或 ZIP 恢复，禁止写入 Capacitor 配置、Manifest、Gradle 或 Git。

## 4. Validation & Error Matrix

| 条件 | 结果 |
| --- | --- |
| 使用 `capacitor.config.ts` 且项目 TypeScript 为 7 | Capacitor CLI 读取配置失败；使用等价的 `capacitor.config.json`。 |
| 未设置 JBR/Android SDK 环境变量 | Capacitor/Gradle 无法定位 Java 或 SDK；使用 Android Studio JBR 与 `$HOME/Library/Android/sdk`。 |
| 未声明 `MODIFY_AUDIO_SETTINGS` | Capacitor 音频捕获会把权限请求整体拒绝，即使用户已授权麦克风。 |
| FNS 只提供 HTTP、地址带路径或指向内网 | PocketBase FNS 代理拒绝请求；设置页应提示填写可访问的公共 HTTPS 基础地址。 |
| 从旧网页备份恢复公众号配置 | 旧 AppID/状态可以恢复，但不会恢复旧 Worker 代码；用户需在设置页重新保存有效 AppID/AppSecret。 |
| APK 版本未递增且遗留 Service Worker 接管页面 | 旧页面可能继续执行已删除的授权逻辑；递增版本并由 `MainActivity` 首次加载时注销遗留 Service Worker。 |
| Android 对 `blob:` 链接调用 `<a download>` | WebView 不会开始文件下载；必须调用 `FileDownload.begin`/`append`/`finish`。 |
| 将整份备份 ZIP/Base64 通过 Capacitor 桥接 | WebView 内存会同时保留 ZIP、Base64 与 Java 解码副本并闪退；必须使用 `begin`/`append`/`finish` 分块写入。 |

## 5. Good / Base / Bad Cases

- Good：PWA 构建后同步、Gradle 成功生成 APK；首次录音由系统弹出麦克风授权。
- Good：覆盖安装新版 APK 后，遗留 Service Worker 仅注销一次；本地录音、文章、设置与 PocketBase 登录状态保留，公众号设置不打开外部页面。
- Good：设置页展开“公众号草稿箱”后直接填写 AppID/AppSecret，调用 PocketBase 连通性测试。
- Base：应用从 PWA ZIP 恢复配置、录音与文章，所有数据仍位于 Android WebView 本地存储。
- Bad：为解决构建问题而降级项目 TypeScript、把密钥写进 APK，或恢复 Worker 授权页；这三种做法都不允许。

## 6. Tests Required

1. `npm test` 与 `npm run build` 通过。
2. `npx cap sync android` 通过，`./gradlew assembleDebug` 产生 APK。
3. 真机安装后验证麦克风授权、十秒录音播放/跳转、重启持久化和完整 ZIP 导入。
4. 覆盖安装版本号更高的 APK 后，验证不会打开系统浏览器，且本地数据仍存在。
5. 真机填写 AppID/AppSecret、保存后重启 App，并测试公众号连接仍成功。
6. 为 FNS 配置 HTTPS 地址，验证同源 PocketBase FNS 代理的 Token 测试和笔记同步；不得要求 FNS 配置 `https://localhost` CORS。
7. Android 点击下载音频与完整备份，检查 `Download/声笺` 中的文件可被系统文件管理器读取；模拟器至少验证一次 `begin`/`append`/`finish` 写入。

## 7. Wrong vs Correct

### Wrong

```tsx
window.open('https://old-worker.example.com/authorize')
```

### Correct

```ts
await fetch(`${pb.baseUrl}/api/wechat/setup-credential`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${pb.authStore.token}` },
})
```

### Wrong

```ts
link.href = URL.createObjectURL(blob)
link.download = filename
link.click()
```

### Correct

```ts
await exportFullBackup(filename) // Android 分块写入，网页端回退为 <a download>
```
