# PocketBase 调试与复用指南

PocketBase 是一款基于 Go 开发的单文件 BaaS (Backend-as-a-Service) 方案，集成了 SQLite、用户认证 (Auth)、文件存储、以及开箱即用的 Web 管理后台。以下为后续开发与复用该方案的实践指南。

---

## 1. 快速启动与环境准备

### 1.1 启动命令
在 `backends/pocketbase/` 目录下执行：
```bash
./pocketbase serve
```
*   **默认端口**：`8090` (API 根路径：`http://127.0.0.1:8090/api/`)
*   **Admin UI 路径**：`http://127.0.0.1:8090/_/`
*   **开发模式自动创建账号**：首次启动或清空数据时，访问后台注册管理员账号。

### 1.2 清空重置数据库
PocketBase 的所有数据（包含 Collection 配置和记录）都存储在 `backends/pocketbase/pb_data/` 目录中。
如需重置，在关闭服务后执行：
```bash
rm -rf backends/pocketbase/pb_data/
```
再次启动后，它将重新初始化并应用迁移脚本。

---

## 2. 数据库结构定义与迁移 (Schema)

PocketBase v0.23+ 推荐使用 **JavaScript/TypeScript 迁移文件** 声明 Collection 结构。

### 2.1 迁移文件位置
所有的结构定义存放在 `backends/pocketbase/pb_migrations/` 目录下，文件命名遵循时间戳前缀（如 `1700000000_init_notes.js`）。

### 2.2 Collection 导入模板 (JSVM)
编写迁移文件时，推荐使用 `app.importCollections` 扁平导入，以规避 `BaseCollection` 未定义等 ReferenceError 报错。示例如下：
```javascript
migrate((app) => {
  const collection = {
    "name": "notes",
    "type": "base",
    "system": false,
    "schema": [
      { "name": "title", "type": "text", "required": true },
      { "name": "content", "type": "text" },
      { "name": "tags", "type": "json" },
      { "name": "attachments", "type": "json" }
    ],
    "indexes": [
      "CREATE INDEX idx_notes_created ON notes(created)" // 必须为排序建索引
    ],
    "listRule": "",   // 空白字符串表示公开匿名读取
    "viewRule": "",
    "createRule": "",
    "updateRule": "",
    "deleteRule": ""
  };
  app.importCollections([collection], false);
}, (app) => {
  // 回滚逻辑
  try {
    const collection = app.findCollectionByNameOrId("notes");
    app.delete(collection);
  } catch (_) {}
});
```

---

## 3. 数据导入与压测

### 3.1 批量 HTTP API 导入
可复用 [import_data.js](file:///Users/luluen/ai-project/backen_test/backends/pocketbase/import_data.js) 脚本，采用异步并发分批（Batch）写入。
```bash
node backends/pocketbase/import_data.js
```
*   *提示*：若遇到写锁限制，可调小批次并发度（如 `batchSize = 20`）。

### 3.2 压测基准命令
```bash
node scripts/benchmark.js pocketbase
```
*   结果会自动存储到 `results/pocketbase/benchmark.json`。

---

## 4. 前端集成复用 (Client)

### 4.1 标准适配器参考
前端开发时，无需安装 SDK 也可使用原生 `fetch` 轻松对接，参考 [PocketBaseAdapter.ts](file:///Users/luluen/ai-project/backen_test/frontend/src/adapters/PocketBaseAdapter.ts)：

*   **创建记录** (POST): `/api/collections/notes/records`
*   **修改记录** (PATCH): `/api/collections/notes/records/:id`
*   **列表读取** (GET): `/api/collections/notes/records?page=1&perPage=10&sort=-created`
*   **模糊检索** (GET): `/api/collections/notes/records?filter=title ~ "query" || content ~ "query"`
