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

- 根目录 `capacitor.config.json` 固定包含 `appId: "fun.lucc.voicenest"`、`appName: "声笺"`、`webDir: "dist"` 和 `server.androidScheme: "https"`。
- Android WebView 的预期 Origin 为 `https://localhost`。
- `android/app/src/main/AndroidManifest.xml` 必须声明 `INTERNET` 与 `RECORD_AUDIO`。
- 录音仍使用 Web 的 `navigator.mediaDevices`、`MediaRecorder` 和 Dexie；完整 ZIP 仍由 `src/lib/backup.ts` 导入。
- 密钥只能由设置页输入或 ZIP 恢复，禁止写入 Capacitor 配置、Manifest、Gradle 或 Git。

## 4. Validation & Error Matrix

| 条件 | 结果 |
| --- | --- |
| 使用 `capacitor.config.ts` 且项目 TypeScript 为 7 | Capacitor CLI 会在读取 `ModuleKind.CommonJS` 时失败；改用等价的 `capacitor.config.json`。 |
| 未设置 JBR/Android SDK 环境变量 | Capacitor/Gradle 无法定位 Java 或 SDK；使用 Android Studio JBR 与 `$HOME/Library/Android/sdk`。 |
| 未声明 `RECORD_AUDIO` | WebView 无法完成录音授权；构建前检查 Manifest。 |
| 未连接 Android 设备 | APK 构建可通过，但真机录音、备份导入和 Access 登录必须标记为待用户验收。 |

## 5. Good / Base / Bad Cases

- Good：PWA 构建后同步、Gradle 成功生成 APK；首次录音由系统弹出麦克风授权。
- Base：应用从 PWA ZIP 恢复配置、录音与文章，所有数据仍位于 Android WebView 本地存储。
- Bad：为解决构建问题而降级项目 TypeScript 或把密钥写进 APK；这两种做法都不允许。

## 6. Tests Required

1. `npm test` 与 `npm run build` 通过。
2. `npx cap sync android` 通过，`./gradlew assembleDebug` 产生 APK。
3. 真机安装后验证麦克风授权、十秒录音播放/跳转、重启持久化和完整 ZIP 导入。

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
  "server": { "androidScheme": "https" }
}
```
