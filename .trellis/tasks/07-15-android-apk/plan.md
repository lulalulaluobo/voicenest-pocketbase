# 原生 Android APK 封装实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标：** 把声笺 PWA 封装为可侧载的 Capacitor Android 调试 APK，并在不降低 Worker 鉴权的前提下支持现有服务链路。

**架构：** Vite 仍构建唯一的 React 前端到 `dist/`，Capacitor 把该产物同步至 Android WebView。录音、Dexie、LocalStorage 和 ZIP 导入沿用现有浏览器实现；Android 只声明麦克风权限。公众号 Worker 将根据请求 Origin 反射允许的两个精确来源，Cloudflare Access 不变。

**技术栈：** React 19、Vite 8、Capacitor 8、Android Gradle、Vitest、Cloudflare Workers。

## 全局约束

- 应用 ID 固定为 `fun.lucc.voicenest`，显示名为“声笺”，Web 构建目录固定为 `dist`。
- 不把 API Key、Token 或公众号密钥写入 Android 工程、Capacitor 配置或 Git。
- Android Origin 固定为 `https://localhost`，Worker 仅额外放行它与现有生产 Origin `https://obvoice.lucc.fun`。
- 保留 Cloudflare Access；不得以服务 Token、通配 CORS 或取消认证解决 WebView 访问问题。
- 不新增录音、数据库或文件系统插件；复用 MediaRecorder、Dexie 和浏览器文件选择器。

---

### Task 1：建立 Capacitor Android 壳与移动端元数据

**文件：**
- 修改：`package.json`
- 修改：`package-lock.json`
- 新建：`capacitor.config.ts`
- 修改：`vite.config.ts`
- 修改：`index.html`
- 新建：`android/`（由 Capacitor CLI 生成）
- 修改：`android/app/src/main/AndroidManifest.xml`

**依赖：**
- 消费：现有 `npm run build` 输出的 `dist/`。
- 产出：可由 `npx cap sync android` 同步的 Android 项目；Android WebView 的稳定 Origin 为 `https://localhost`。

- [ ] **步骤 1：添加 Capacitor 依赖并生成锁文件变更。**

  运行：

  ```bash
  npm install @capacitor/core@^8 @capacitor/android@^8
  npm install -D @capacitor/cli@^8
  ```

  预期：`package.json` 的 `dependencies` 含 `@capacitor/core`、`@capacitor/android`，`devDependencies` 含 `@capacitor/cli`。

- [ ] **步骤 2：创建最小 Capacitor 配置。**

  写入 `capacitor.config.ts`：

  ```ts
  import type { CapacitorConfig } from '@capacitor/cli'

  const config: CapacitorConfig = {
    appId: 'fun.lucc.voicenest',
    appName: '声笺',
    webDir: 'dist',
    server: { androidScheme: 'https' },
  }

  export default config
  ```

- [ ] **步骤 3：补齐 PWA 安装元数据。**

  在 `vite.config.ts` 的 `manifest` 中增加：

  ```ts
  id: '/',
  start_url: '/',
  scope: '/',
  ```

  在 `index.html` 的 `<head>` 增加：

  ```html
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-title" content="声笺" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  ```

- [ ] **步骤 4：生成 Android 工程并声明麦克风权限。**

  运行：

  ```bash
  npx cap add android
  ```

  在 `android/app/src/main/AndroidManifest.xml` 保留现有 `INTERNET`，再增加：

  ```xml
  <uses-permission android:name="android.permission.RECORD_AUDIO" />
  ```

  不修改生成的 `MainActivity`：Capacitor 8 官方 `BridgeWebChromeClient` 已将 WebView 的 `AUDIO_CAPTURE` 映射为 `RECORD_AUDIO` 运行时请求。

- [ ] **步骤 5：构建并同步。**

  运行：

  ```bash
  npm run build
  npx cap sync android
  ```

  预期：TypeScript/Vite 构建成功；输出显示 Android 平台已同步。

- [ ] **步骤 6：提交原生壳。**

  ```bash
  git add package.json package-lock.json capacitor.config.ts vite.config.ts index.html android
  git commit -m "feat: 添加 Android 原生应用壳"
  codegraph sync
  ```

### Task 2：精确扩展公众号 Worker 的 Android CORS 来源

**文件：**
- 修改：`workers/wechat-draft/wrangler.jsonc`
- 修改：`workers/wechat-draft/src/index.ts`
- 修改：`workers/wechat-draft/src/types.ts`
- 修改：`workers/wechat-draft/src/index.test.ts`

**依赖：**
- 消费：Task 1 确定的 `https://localhost`。
- 产出：只接受生产 PWA 或 Android WebView Origin 的 CORS 响应。

- [ ] **步骤 1：先添加 Worker CORS 失败测试。**

  在 `workers/wechat-draft/src/index.test.ts` 为 `https://localhost` 增加一条成功预检断言：

  ```ts
  expect(response.status).toBe(204)
  expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://localhost')
  ```

  并为 `https://untrusted.example` 保留或增加：

  ```ts
  expect(response.status).toBe(403)
  ```

  运行：

  ```bash
  npm test --prefix workers/wechat-draft -- index.test.ts
  ```

  预期：新增 Android Origin 测试先失败。

- [ ] **步骤 2：把单值来源改为逗号分隔的 allowlist。**

  `workers/wechat-draft/wrangler.jsonc` 设置：

  ```json
  "ALLOWED_ORIGINS": "https://obvoice.lucc.fun,https://localhost"
  ```

  `Env` 将 `ALLOWED_ORIGIN: string` 改为 `ALLOWED_ORIGINS: string`。在 `index.ts` 实现并使用：

  ```ts
  function allowedOrigin(request: Request, env: Env): string | undefined {
    const origin = request.headers.get('Origin')
    return origin && env.ALLOWED_ORIGINS.split(',').includes(origin) ? origin : undefined
  }
  ```

  `json` 与 OPTIONS 响应只在 `allowedOrigin` 返回值存在时写入 `Access-Control-Allow-Origin`；所有当前传入 `env.ALLOWED_ORIGIN` 的错误与成功响应改为对应请求的允许 Origin。未允许来源继续返回 403。

- [ ] **步骤 3：运行 Worker 全量测试。**

  运行：

  ```bash
  npm test --prefix workers/wechat-draft
  ```

  预期：所有 Worker 测试通过，`https://localhost` 被精确回显，非 allowlist 来源为 403。

- [ ] **步骤 4：部署 Worker 并做受保护端点人工检查。**

  运行：

  ```bash
  npm run deploy --prefix workers/wechat-draft
  ```

  预期：Worker 部署成功；Cloudflare Access 仍要求原有登录。不得添加服务 Token 或宽松 CORS。

- [ ] **步骤 5：提交 Worker CORS 修改。**

  ```bash
  git add workers/wechat-draft
  git commit -m "fix: 允许 Android 公众号请求来源"
  codegraph sync
  ```

### Task 3：生成、构建并交付调试 APK

**文件：**
- 生成：`android/app/build/outputs/apk/debug/app-debug.apk`

**依赖：**
- 消费：Task 1 Android 工程和 Task 2 已部署的 Worker。
- 产出：可安装 APK 与可重复执行的构建验证结果。

- [ ] **步骤 1：运行 Web 与 Worker 自动测试。**

  运行：

  ```bash
  npm test
  npm test --prefix workers/wechat-draft
  npm run build
  ```

  预期：所有测试与构建通过。

- [ ] **步骤 2：同步网页资源并构建 APK。**

  运行：

  ```bash
  npx cap sync android
  export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
  export ANDROID_HOME="$HOME/Library/Android/sdk"
  (cd android && ./gradlew assembleDebug)
  ```

  预期：Gradle 成功，文件存在：

  ```bash
  test -f android/app/build/outputs/apk/debug/app-debug.apk
  ```

- [ ] **步骤 3：真机验收。**

  在 Android 手机上安装 APK 后依次检查：

  1. 点击录音并接受系统麦克风权限；录制十秒，停止、播放并跳转进度。
  2. 强制关闭后重新打开，确认录音、转写与整理内容仍在。
  3. 从已部署 PWA 导出的完整 ZIP 导入，确认音频、文章和设置恢复。
  4. 用恢复或手动配置测试 ASR、LLM、Obsidian。
  5. 登录 Cloudflare Access 后测试公众号预览与“发布到草稿箱”。

  若第 5 项因 WebView Cookie 策略失败，记录请求 Origin、HTTP 状态和 Access 行为；保持 Access，不通过内置凭据绕过。

- [ ] **步骤 4：记录结果并提交可追踪配置。**

  把自动测试、APK 路径和真机验收结果写入 `.trellis/tasks/07-15-android-apk/check.jsonl`。只提交源代码、配置和文档，不提交 APK 二进制或本地构建产物：

  ```bash
  git add .trellis/tasks/07-15-android-apk
  git commit -m "docs: 记录 Android APK 验证结果"
  codegraph sync
  ```

## 计划自检

- 覆盖 PRD 的 APK、录音权限、备份迁移、密钥边界与 Worker 安全要求。
- CORS 变更有先失败的精确来源测试；Web/Worker 构建与 APK 生成有独立验证。
- 未包含 Kotlin 重写、商店发布、后台录音、文件系统插件或自动更新。
