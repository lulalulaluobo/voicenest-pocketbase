# Obsidian 本地单向同步契约

## 1. Scope / Trigger

录音整理完成时，前端必须将笔记排入 PocketBase 队列；Obsidian 插件只负责拉取与本地写入，不能向 VoiceNest 回传或修改笔记正文。

## 2. Signatures

```text
obsidian_notes { owner, sourceId, title, markdown, path }
obsidian_sync_receipts { owner, sourceId, ackedAt }
POST /api/obsidian/queue { sourceId, title, markdown, path }
GET  /api/obsidian/sync/changes
POST /api/obsidian/sync/ack { noteIds }
GET  /api/obsidian/sync/status?sourceIds=<csv>
```

release 构建要求 `VOICENEST_RELEASE_STORE_FILE`、`VOICENEST_RELEASE_STORE_PASSWORD`、`VOICENEST_RELEASE_KEY_ALIAS` 和 `VOICENEST_RELEASE_KEY_PASSWORD`。

## 3. Contracts

`sourceId` 必须是客户端本地录音 id，且 `(owner, sourceId)` 唯一。前端只能调用受控入队接口，不能直接创建 Collection 记录。插件完成 Vault 写入后才 ACK；后端删除正文队列项并保留 7 天无正文回执，插件 YAML 使用 `voicenest_id: sourceId`，以便重试覆盖原文件。

## 4. Validation & Error Matrix

| 条件 | 结果 |
| --- | --- |
| 前端未登录 | 拒绝入队并提示登录。 |
| 插件写入失败 | 不 ACK，正文留在队列，下次继续拉取。 |
| release 签名变量缺失 | Gradle 拒绝 release 构建。 |
| 更新 APK 摘要、包名、版本或签名不一致 | 不请求 Android 安装。 |

## 5. Good / Base / Bad Cases

* Good：同一用户的插件写入成功后 ack；重复执行覆盖同一文件。
* Base：网络在写入后断开，下一次同步覆盖文件并完成 ack。
* Bad：恢复 FNS/CORS 代理、将 Obsidian 密码写入 APK，或改用新的 release 证书。

## 6. Tests Required

* `obsidian-queue.test.ts` 断言仅登录用户可创建带 owner 的队列记录。
* `npm test`、`npm run build`、`obsidian-plugin` 的 `npm run build` 必须通过。
* `assembleRelease` 必须成功，`apksigner verify --print-certs` 的 SHA-256 必须匹配固定 keystore。

## 7. Wrong vs Correct

```ts
// Wrong: 将笔记直接发往 FNS 或浏览器端 CORS 服务
await fetch('https://fns.example/api/note', { body: markdown })

// Correct: 前端仅写入自己的 PocketBase 队列
await pb.send('/api/obsidian/queue', { method: 'POST', body: { sourceId, title, markdown, path } })
```
