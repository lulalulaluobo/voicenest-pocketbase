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

- 根目录 `capacitor.config.json` 固定包含 `appId: "fun.lucc.voicenest"`、`appName: "声笺"`、`webDir: "dist"` 和 `server.androidScheme: "https"`；`server.allowNavigation` 只能列出 `wechat-api.lucc.fun`，用于在同一 WebView 完成 Cloudflare Access 授权。
- Android WebView 的预期 Origin 为 `https://localhost`。
- `android/app/src/main/AndroidManifest.xml` 必须声明 `INTERNET`、`MODIFY_AUDIO_SETTINGS` 与 `RECORD_AUDIO`；Capacitor 对音频捕获会同时请求后两项。
- `MainActivity` 必须允许 WebView 接收 Cookie 与第三方 Cookie；设置页“重新授权”必须使用当前窗口跳转，授权完成后由用户返回应用，使 Access Cookie 留在同一 WebView。
- Android 构建每次交付新前端时必须递增 `android/app/build.gradle` 的 `versionCode`；Android 内不注册 PWA Service Worker，`MainActivity` 首次加载 `https://localhost` 时只注销遗留 Service Worker 并重载，不能清空 WebView 数据、Dexie 或 Cookie。
- 录音仍使用 Web 的 `navigator.mediaDevices`、`MediaRecorder` 和 Dexie；完整 ZIP 仍由 `src/lib/backup.ts` 导入。
- 密钥只能由设置页输入或 ZIP 恢复，禁止写入 Capacitor 配置、Manifest、Gradle 或 Git。

## 4. Validation & Error Matrix

| 条件 | 结果 |
| --- | --- |
| 使用 `capacitor.config.ts` 且项目 TypeScript 为 7 | Capacitor CLI 会在读取 `ModuleKind.CommonJS` 时失败；改用等价的 `capacitor.config.json`。 |
| 未设置 JBR/Android SDK 环境变量 | Capacitor/Gradle 无法定位 Java 或 SDK；使用 Android Studio JBR 与 `$HOME/Library/Android/sdk`。 |
| 未声明 `MODIFY_AUDIO_SETTINGS` | Capacitor 音频捕获会把权限请求整体拒绝，即使用户已授权麦克风。 |
| 在外部浏览器完成 Access 授权 | Access Cookie 不会回到应用 WebView，预览和发布会显示 `Failed to fetch`。 |
| APK 版本未递增且遗留 Service Worker 接管页面 | 旧页面仍会执行 `window.open`，导致授权跳到系统浏览器并出现 Access `Invalid login session`。 |
| 未连接 Android 设备 | APK 构建可通过，但真机录音、备份导入和 Access 登录必须标记为待用户验收。 |

## 5. Good / Base / Bad Cases

- Good：PWA 构建后同步、Gradle 成功生成 APK；首次录音由系统弹出麦克风授权。
- Good：覆盖安装新版 APK 后，遗留 Service Worker 仅注销一次；本地录音、文章、设置与 Access Cookie 保留，公众号授权留在 App 内。
- Base：应用从 PWA ZIP 恢复配置、录音与文章，所有数据仍位于 Android WebView 本地存储。
- Bad：为解决构建问题而降级项目 TypeScript 或把密钥写进 APK；这两种做法都不允许。

## 6. Tests Required

1. `npm test` 与 `npm run build` 通过。
2. `npx cap sync android` 通过，`./gradlew assembleDebug` 产生 APK。
3. 真机安装后验证麦克风授权、十秒录音播放/跳转、重启持久化和完整 ZIP 导入。
4. 覆盖安装版本号更高的 APK 后，验证授权不会打开系统浏览器，且本地数据仍存在。

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
    "allowNavigation": ["wechat-api.lucc.fun"]
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
