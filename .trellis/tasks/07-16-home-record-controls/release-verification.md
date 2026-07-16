# 多端发布验证记录

验证时间：2026-07-16

## 发布提交

- Git 提交：`8079d0da953b3a5c6365813e41e7a7f09277dfa9`
- 前端构建：`npm test`（30 项）与 `npm run build` 均成功。
- 仓库没有 Git 远程；本次通过 CLI 手动部署。

## 入口地图与结果

| 入口 | 结果 |
| --- | --- |
| Web / 自定义域名 `obvoice.lucc.fun` | 已通过 Vercel 部署并显式切换别名。生产 HTML 返回本次构建资源 `index-DgGReZLc.js`，HTTP 200。 |
| 已安装 PWA | 生产 Web 已更新；仍需在已有安装实例完整重启后确认 Service Worker 已换新。 |
| Worker `wechat-api.lucc.fun` | 已部署 `voicenest-wechat-draft`，版本 `072a2c25-c14b-430a-b5d9-1b74d8c4d9d1`，并保留现有 KV 与环境变量。业务 `/preview` 仍受 Cloudflare Access 登录保护，需登录会话后验证。 |
| Android release APK | 已构建 `android/app/build/outputs/apk/release/app-release-unsigned.apk`，包版本为 `versionCode 8` / `versionName 1.7`；因未配置 release 签名，不能安装或作为生产包交付。 |
| Android 模拟器验证 | 已构建并安装 debug APK 到 `emulator-5554`，应用正常启动至固定单屏主页，底部导航可见，无崩溃日志。 |

## 剩余发布动作

1. 提供 release keystore 后签名 release APK，安装到真机并完成录音、暂停、结束的最短路径。
2. 在生产 Web/PWA 与 Android WebView 的已登录 Cloudflare Access 会话中，各调用一次 Worker `/preview`，验证回跳、Cookie 和接口响应。
3. 在已安装 PWA 完整重启后确认 Service Worker 更新。
