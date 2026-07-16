# 多端发布验证记录

验证时间：2026-07-16

## 发布提交

- Git 提交：`8079d0da953b3a5c6365813e41e7a7f09277dfa9`
- 前端构建：`npm run build` 成功。
- 仓库没有 Git 远程；本次需要手动部署，提交不会触发 CI/CD。

## 入口地图与结果

| 入口 | 现状 | 验证结果 |
| --- | --- | --- |
| Web / 自定义域名 `obvoice.lucc.fun` | Vercel 静态 PWA | 生产 HTML 引用的资源哈希与本次本地构建不同，尚未部署本次提交。 |
| 已安装 PWA | 依赖生产站点及 Service Worker 更新 | 未验证；生产 Web 仍为旧资源，不能交付为本次版本。 |
| Worker `wechat-api.lucc.fun` | Cloudflare Worker，自定义域名 | 未验证业务响应。来自生产 Origin 的无副作用 `/preview` 请求被 Cloudflare Access 以 302 登录跳转拦截，发生在 Worker CORS 逻辑之前。 |
| Android APK | Capacitor Android，`versionCode 8` / `versionName 1.7` | 未构建；本机无 Java Runtime，Gradle 无法启动；未发现可交付的 APK/AAB 产物。 |

## 发布阻塞与后续验证

1. 通过 Vercel 手动部署当前提交，并确认 `obvoice.lucc.fun` 的 HTML 引用新构建资源。
2. 在已安装 PWA 完整重启后确认 Service Worker 已更新，再完成主页最短录音路径。
3. 在同一浏览器容器完成 Cloudflare Access 登录后，从 Web/PWA 重新调用 `/preview`；Android 还需从 `https://localhost` Origin 走完登录、回跳、Cookie 持久化和接口调用。
4. 安装 JDK 后运行 Capacitor 同步和 Gradle release 构建，安装 APK 到真机并完成本次主页录音路径。

在以上入口未完成验证前，不应将本次提交宣称为已发布版本。
