# PocketBase 0.27 升级与安全加固经验

## 背景

pocketbase-backend 重构分支初期存在多个阻断生产的问题：
- 前端 JS SDK 0.27.0 与服务端 0.22.20 严重不匹配（跨 5 个 minor 版本）
- 4 个迁移文件签名混用（部分 v0.22 老 API，部分 v0.23+ 新 API），任何单一 PB 版本都跑不通
- 微信加密主密钥硬编码降级、缺 `.dockerignore`、filter 字符串注入等

2026-07-18 完成 PB 0.27 升级与 P0/P1 安全修复，全部改动通过真实 PB 0.27 容器实测。

## 关键经验（避免重复踩坑）

### 1. PocketBase v0.22 → v0.23+ 破坏性变更

| 维度 | v0.22（旧） | v0.23+（新，含 0.27） |
|---|---|---|
| 迁移签名 | `migrate((db) => {...})` + `new Dao(db)` | `migrate((app) => {...})` + 直接用 `app` |
| collection 字段键 | `"schema": [...]` | **`"fields": [...]`**（schema 键失效，字段不会被注册） |
| 字段配置位置 | 嵌套在 `options: {...}` | 提升到字段对象顶层（如 relation 的 `collectionId`、file 的 `maxSize`/`mimeTypes`） |
| 字段类型构造器 | 统一 `new SchemaField({type:"json"})` | 具体类型 `new JSONField(...)`、`new TextField(...)`、`new RelationField(...)` 等 |
| 字段集合操作 | `collection.schema.addField(...)` / `getFieldByName` / `removeField` | `collection.fields.add(...)` / `getByName` / `removeByName` |
| hooks 回调参数 | echo.Context `c`，`c.get("authRecord")` | event `e`，`e.auth`（注意不是 `e.authRecord`） |
| 请求体 | `c.request().body`（字符串） | `e.requestInfo().body`（JSON 请求自动解析为对象，**不能再 `JSON.parse`**） |
| 路由中间件 | 手动 `c.get("authRecord")` 判空 | `routerAdd(method, path, handler, $apis.requireAuth())` 第四参数挂中间件 |

参考文档：
- 升级指南：https://pocketbase.io/v023upgrade/jsvm/
- API rules（null vs ""）：https://pocketbase.io/docs/api-rules-and-filters/
- JSVM Caveats：https://pocketbase.io/docs/js-overview/#caveats-and-limitations

### 2. JSVM Handler 隔离作用域（最隐蔽的坑）

**每个 routerAdd/hook handler 都在独立 context 中序列化执行**，文件级 `function` 声明、`globalThis` 属性、IIFE 闭包对 handler 都**不可见**。

错误示例（会报 `xxx is not defined`）：
```js
function helper() { return "ok"; }
routerAdd("GET", "/api/x", (e) => {
  return e.json(200, { v: helper() });  // ❌ helper undefined
});
```

正确做法——**把 helper 抽到独立 `*.js` 模块，handler 内 `require()` 加载**：
```js
// pb_hooks/helpers.js
function helper() { return "ok"; }
module.exports = { helper: helper };

// pb_hooks/main.pb.js
routerAdd("GET", "/api/x", (e) => {
  const H = require(`${__hooks}/helpers.js`);
  return e.json(200, { v: H.helper() });  // ✅
});
```

注意：require 的模块内 `$http`、`$security`、`Record`、`DynamicModel` 等全局对象可用，但 `os` 要写成 `$os`。

参考：https://github.com/pocketbase/pocketbase/discussions/3408

### 3. importCollections 创建带字段引用规则的集合

`importCollections` 时 API 规则若引用 `fields` 中的字段，只要字段结构正确（用 `fields` 键、字段配置在顶层），就能在创建时一起写入规则。无需分两步。

### 4. `realClientIp` 在本地测试为空

`e.requestInfo().realClientIp` 在直连 127.0.0.1 时为 null。限流逻辑必须降级取 `X-Forwarded-For`，仍为空用 `"unknown"` 占位，否则限流永远不生效。

### 5. PocketBase JS SDK 版本必须与服务端对齐

- JS SDK ≥0.22.0-pb0.23 强制要求服务端 ≥v0.23
- 服务端下载链接格式：`pocketbase_${VERSION}_${TARGETOS}_${TARGETARCH}.zip`
- 固定方式：Dockerfile `ARG PB_VERSION=0.27.0`

### 6. 自定义路由不要重写 `/_/`

PocketBase 内置 `GET /_/{path...}` 提供 admin 静态资源。如果再 `routerAdd("GET", "/_/", ...)` 会触发路由冲突 panic，启动失败。汉化脚本应通过 `/_/vn_i18n.js` 单独路由提供，不要重写 admin 首页。

## 本分支落地的安全约定

- **VN_ENCRYPTION_KEY** 必须 32 字节随机字符串，缺失或长度不符时 `getMasterEncryptionKey()` 直接 throw 拒绝服务（不降级）
- `VN_ENCRYPTION_KEY` 仅用 docker-compose 的运行时 environment 注入，禁止作为 Docker `ARG` 或 `ENV` 写入镜像配置
- 生产镜像在本地以 `linux/amd64` 构建并推送到 `lulalulaluobo/voicenest:<不可变标签>`；VPS 只通过 `VOICENEST_IMAGE` 拉取固定标签，禁止在服务器源码构建
- 首次创建 `pb_data/data.db` 时，`docker-entrypoint.sh` 使用 `PB_SUPERUSER_EMAIL`、`PB_SUPERUSER_PASSWORD` 创建超级管理员；禁止固定默认账号，已有部署须立即轮换旧账号凭据
- docker-compose 默认只绑定 `127.0.0.1:8090`；公网流量必须经配置 TLS 的反向代理进入
- `.dockerignore` 必须排除 `pb_data/`、`node_modules/`、`.git/`，防止数据库和密钥焙进镜像层
- 微信路由全部加 `$apis.requireAuth()` + per-route IP 限流（10/分钟，preview 20/分钟）
- 微信封面请求在服务端限制为 5 MiB（Base64 编码前），标题限制 128 字符、Markdown 限制 20,000 字符；错误响应不得回显上游异常原文
- 录音 audio 字段 mimeTypes 精确匹配 `src/lib/audio-mime.ts` 全部候选（含 `;codecs=` 变体）

## 本地验证 PocketBase 迁移的标准流程

```bash
# 下载对应架构的 PB 二进制
curl -sL https://github.com/pocketbase/pocketbase/releases/download/v0.27.0/pocketbase_0.27.0_darwin_arm64.zip -o /tmp/pb.zip
unzip /tmp/pb.zip -d /tmp/pb-test

# 复制迁移和 hooks
cp -r pb_migrations pb_hooks /tmp/pb-test/

# 启动让它自动跑迁移
cd /tmp/pb-test
export VN_ENCRYPTION_KEY="$(openssl rand -base64 24 | head -c 32)"
./pocketbase serve --http=127.0.0.1:8091 --dir=./pb_data &
sleep 5

# 验证迁移结果
sqlite3 pb_data/data.db "SELECT name FROM _collections WHERE system=0;"
sqlite3 pb_data/data.db "SELECT sql FROM sqlite_master WHERE name='recordings';"
```

## APK 后端地址动态配置（2026-07-18 追加）

### 问题背景

PocketBase 同源部署（dist/ 复制到 pb_public）让**浏览器**场景下 `window.location.origin` 即后端地址，无需配置。但 **APK（Capacitor）** 默认用 `https://localhost` 加载 WebView 内的本地 dist，那里没有 PocketBase，所有 API 请求会失败 —— APK 用户根本无法登录。

### 解决方案：应用内可配置后端地址

**`src/lib/pocketbase.ts`** 核心逻辑（关键）：
```ts
function detectInitialEndpoint(): string {
  // 1. 优先读 localStorage 的 vn_pocketbase_url（用户配置过）
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem('vn_pocketbase_url')
    if (stored) return stored
  }
  // 2. APK 环境：返回空字符串，由 App 层弹出配置引导
  if (typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform?.()) return ''
  // 3. 浏览器：同源部署，window.location.origin 即后端地址
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin
  // 4. 测试/SSR：占位
  return 'http://127.0.0.1:8090'
}
```

导出 `setPocketbaseUrl(url)`：写入 localStorage + 实时更新 `pb.baseUrl`（PocketBase JS SDK 支持 setter）。

### 三个交互入口

1. **首次启动引导**（`src/components/BackendSetupPrompt.tsx`）：`App.tsx` 检测 `!isPocketbaseUrlConfigured()` 时显示，用户填地址 + 探测 `/api/health` 验证后保存。
2. **设置页修改**（`src/pages/SettingsPage.tsx` 顶部「后端连接」卡片）：随时改地址，同样验证后保存。
3. **强制 HTTPS**：APK 原生 WebView 不信任 HTTP，BackendSetupPrompt 和 SettingsPage 都强制 `https:` 协议校验。

### 测试环境兼容

`detectInitialEndpoint` 顶层执行时，vitest 的 node 环境没有 `localStorage`/`window`，必须用 `typeof` 守卫，否则模块 import 阶段就崩溃（之前的失败教训：5 个测试文件挂掉，因为顶层裸调 `localStorage.getItem`）。

### Capacitor allowNavigation 清理

`capacitor.config.json` 的 `allowNavigation` 曾配 `wechat-api.lucc.fun` 和 `luluen.cloudflareaccess.com`（旧 Cloudflare Access 鉴权用）。Worker 移除后这两个域名作废，整个 `allowNavigation` 字段删除。

## Cloudflare/Vercel 残留彻底清理（2026-07-18 追加）

本分支不再支持 Vercel/Cloudflare Pages 部署前端，也不再使用 Cloudflare Worker。已删除：

- `workers/wechat-draft/` 整个目录（15 个文件，含 src/、wrangler.jsonc、.dev.vars.example 等）
- `docs/cloudflare-pages-test-deployment.md` 旧部署指南
- `capacitor.config.json` 的 `allowNavigation` Cloudflare 域名
- README.md 中所有 Cloudflare/Vercel/FRONTEND_PROVIDER 措辞
- `src/lib/sync.ts` 中向 `codex-stage1-recording.vercel.app` 降级的 fetchWithProxy 代理逻辑（更早移除）

唯一保留的部署路径是 PocketBase Docker（见 README「部署」章节）。
