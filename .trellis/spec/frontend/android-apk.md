# Android APK 封装契约

## 1. Scope / Trigger

当 VoiceNest 的 PWA 需要生成 Android 调试 APK 或同步网页资源到原生工程时，必须使用 Capacitor Android 壳。业务逻辑仍在 `src/`；Android 工程不承载 API Key、Token 或第二套数据层。

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

- 根目录 `capacitor.config.json` 固定包含 `appId: "fun.lucc.voicenest"`、`appName: "声笺"`、`webDir: "dist"` 和 `server.androidScheme: "https"`；`server.allowNavigation` 只能列出 `wechat-api.lucc.fun` 与 `luluen.cloudflareaccess.com`，用于在同一 WebView 完成 Cloudflare Access 授权。
- Android WebView 的预期 Origin 为 `https://localhost`。
- `android/app/src/main/AndroidManifest.xml` 必须声明 `INTERNET`、`MODIFY_AUDIO_SETTINGS` 与 `RECORD_AUDIO`；Capacitor 对音频捕获会同时请求后两项。
- `MainActivity` 必须允许 WebView 接收 Cookie 与第三方 Cookie，并在页面完成时调用 `CookieManager.flush()`；否则用户在 Access 授权后立即退出，Cookie 可能未持久化。
- 设置页“重新授权”必须使用当前窗口跳转，并向 Worker 根路径传入 `return_to=<当前 origin>/settings?wechat-authorized=1`。Worker 只能接受 `ALLOWED_ORIGINS` 中的 HTTPS origin、固定 `/settings` 路径和固定查询参数；授权完成后以 302 回到应用，禁止把任意 URL 作为回跳地址。
- Android 构建每次交付新前端时必须递增 `android/app/build.gradle` 的 `versionCode`；Android 内不注册 PWA Service Worker，`MainActivity` 首次加载 `https://localhost` 时只注销遗留 Service Worker 并重载，不能清空 WebView 数据、Dexie 或 Cookie。
- Android WebView 不支持把 `blob:` 的 `<a download>` 写入文件；`FileDownload` 原生插件必须用 `ACTION_CREATE_DOCUMENT` 让用户选择保存位置，再写入浏览器传来的 Base64。网页端继续使用 `<a download>` 回退。该桥接会占用完整文件内存，不适合超长录音。
- 音频列表不提供按处理状态筛选；列表页的标题、搜索和标签筛选必须使用 `position: sticky` 固定在顶部，只有录音卡片列表随页面滚动。
- 录音仍使用 Web 的 `navigator.mediaDevices`、`MediaRecorder` 和 Dexie；完整 ZIP 仍由 `src/lib/backup.ts` 导入。
- 密钥只能由设置页输入或 ZIP 恢复，禁止写入 Capacitor 配置、Manifest、Gradle 或 Git。

## 4. Validation & Error Matrix

| 条件 | 结果 |
| --- | --- |
| 使用 `capacitor.config.ts` 且项目 TypeScript 为 7 | Capacitor CLI 会在读取 `ModuleKind.CommonJS` 时失败；改用等价的 `capacitor.config.json`。 |
| 未设置 JBR/Android SDK 环境变量 | Capacitor/Gradle 无法定位 Java 或 SDK；使用 Android Studio JBR 与 `$HOME/Library/Android/sdk`。 |
| 未声明 `MODIFY_AUDIO_SETTINGS` | Capacitor 音频捕获会把权限请求整体拒绝，即使用户已授权麦克风。 |
| 在外部浏览器完成 Access 授权 | Access Cookie 不会回到应用 WebView，预览和发布会显示 `Failed to fetch`。 |
| 仅允许 Worker 域名而遗漏 Access 团队域名 | Worker 的 302 会在登录页跳到系统浏览器，Access 显示 `Invalid login session`。 |
| Worker 授权成功页只返回纯文本 | 用户停留在 Access 页面且没有返回 App 的路径；应验证 `return_to` 后 302 回到设置页。 |
| 只接受 Cookie、未调用 `flush()` | 授权后立即退出可能丢失 Access 会话；在 `onPageFinished` 强制落盘。 |
| 直接重定向未校验的 `return_to` | 会形成开放重定向；只允许已配置 origin 的固定设置页地址。 |
| APK 版本未递增且遗留 Service Worker 接管页面 | 旧页面仍会执行 `window.open`，导致授权跳到系统浏览器并出现 Access `Invalid login session`。 |
| Android 对 `blob:` 链接调用 `<a download>` | WebView 不会开始文件下载；必须调用 `FileDownload.save`。 |
| 未连接 Android 设备 | APK 构建可通过，但真机录音、备份导入和 Access 登录必须标记为待用户验收。 |

## 5. Good / Base / Bad Cases

- Good：PWA 构建后同步、Gradle 成功生成 APK；首次录音由系统弹出麦克风授权。
- Good：覆盖安装新版 APK 后，遗留 Service Worker 仅注销一次；本地录音、文章、设置与 Access Cookie 保留，公众号授权留在 App 内。
- Good：Access 验证码通过后，Worker 302 回 `https://localhost/settings?wechat-authorized=1`；设置页展开公众号配置并提示测试连接。
- Good：点击音频或完整备份下载后打开系统保存窗口，用户选定位置才显示成功提示。
- Base：应用从 PWA ZIP 恢复配置、录音与文章，所有数据仍位于 Android WebView 本地存储。
- Bad：为解决构建问题而降级项目 TypeScript 或把密钥写进 APK；这两种做法都不允许。

## 6. Tests Required

1. `npm test` 与 `npm run build` 通过。
2. `npx cap sync android` 通过，`./gradlew assembleDebug` 产生 APK。
3. 真机安装后验证麦克风授权、十秒录音播放/跳转、重启持久化和完整 ZIP 导入。
4. 覆盖安装版本号更高的 APK 后，验证授权不会打开系统浏览器，且本地数据仍存在。
5. 确认 `https://wechat-api.lucc.fun/` 的 302 目标 `https://luluen.cloudflareaccess.com/...` 也留在 App 内。
6. Worker 单测：允许的 `return_to=https://localhost/settings?wechat-authorized=1` 返回 302；外部 origin 不跳转。
7. 真机完成 Access 验证后立即返回 App、退出再打开，并测试公众号连接仍成功。
8. Android 点击下载音频与完整备份，选择位置后检查文件可被系统文件管理器读取。
9. Android 滚动音频列表，确认状态筛选不存在，标题与标签筛选保持可见。

## 7. Wrong vs Correct

### Wrong

```ts
// capacitor.config.ts：当前项目的 TypeScript 7 会使 Capacitor CLI 解析失败。
export default { appId: 'fun.lucc.voicenest' }
```

### Correct

```json
{
  "appId": "fun.lucc.voicenest",
  "appName": "声笺",
  "webDir": "dist",
  "server": {
    "androidScheme": "https",
    "allowNavigation": ["wechat-api.lucc.fun", "luluen.cloudflareaccess.com"]
  }
}
```

### Wrong

```tsx
// Android 与网页 PWA 共用 Service Worker，会让 APK 更新继续运行旧 bundle。
useRegisterSW()
```

### Correct

```tsx
// 仅网页端渲染负责注册 Service Worker 的组件。
{!Capacitor.isNativePlatform() && <ServiceWorkerUpdate canUpdate={recorder.state === 'idle'} />}
```

### Wrong

```ts
link.href = URL.createObjectURL(blob)
link.download = filename
link.click()
```

### Correct

```ts
await downloadBlob(blob, filename) // Android 调用 ACTION_CREATE_DOCUMENT，网页端回退为 <a download>
```

### Wrong

```ts
window.location.assign(workerUrl) // 授权成功后停留在 Worker 页面
```

### Correct

```ts
const returnUrl = new URL('/settings', window.location.origin)
returnUrl.searchParams.set('wechat-authorized', '1')
authorizationUrl.searchParams.set('return_to', returnUrl.toString())
```
