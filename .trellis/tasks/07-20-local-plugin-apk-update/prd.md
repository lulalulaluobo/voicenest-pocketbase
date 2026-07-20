# 重构为本地插件同步与 APK 更新入口

## 目标

移除 VoiceNest 对 Fast Note Sync（FNS）及 PocketBase 双向代理的依赖，改为由本地 Obsidian 插件从 PocketBase 单向拉取笔记；同时将 APK 改为可重复的正式签名构建，并在设置页面提供 GitHub 仓库与 GitHub Release APK 更新入口。

## 已知事实

* 当前前端通过 `src/lib/sync.ts` 将 FNS 配置、Token 和笔记内容提交至 PocketBase 的 `/api/fns/*`；后端由 `pb_hooks/fns.pb.js` / `fns_helpers.js` 转发。
* 参考项目 `references/shijian-clipper` 已移除 FNS，提供 Obsidian 插件的拉取、确认（ack）和游标同步模式，以及 GitHub Release APK 更新实现。
* 当前 Android 包名为 `fun.lucc.voicenest`，版本为 `1.0.2 (3)`，release 构建未配置签名；GitHub 远端为 `lulalulaluobo/voicenest-pocketbase`。

## 需求（演进中）

* 删除 FNS 双向同步的客户端配置、API 路由与 PocketBase hook。
* 新增本地 Obsidian 插件：认证后从 PocketBase 拉取待同步笔记并写入 Vault，成功后确认；不向服务器回写笔记内容。
* PocketBase 提供插件所需的最小单向同步接口与持久化队列。
* 正式 APK 使用同一 release keystore 签名构建，私钥绝不提交到仓库；构建文档说明所需环境变量和发布资产命名。
* 设置页面展示 VoiceNest GitHub 仓库，并允许 Android 用户检查、下载、校验后由系统确认安装 GitHub Release APK。

## 验收标准（演进中）

* [ ] 项目不再包含 `/api/fns/*`、FNS 设置项或 FNS hook。
* [ ] 插件可从 PocketBase 拉取新笔记、写入 Vault，并仅在成功后 ack；重复同步不产生重复文件。
* [ ] `assembleRelease` 在签名变量缺失时失败，变量齐全时输出正式签名 APK。
* [ ] Android 设置页可打开 GitHub 仓库并检查 GitHub 最新 Release；更新包需验证 SHA-256、包名、版本与当前签名后才交给系统安装。
* [ ] 前端测试、插件测试和 Android 相关测试均通过。

## 范围外

* 自动发布 GitHub Release 或将密钥提交到仓库。
* 从既有 FNS 服务自动迁移远端笔记。
* iOS 更新流程。

## 技术说明

* 参考：`references/shijian-clipper/docs/migration-fns-to-plugin.md`、`references/shijian-clipper/obsidian-plugin/src/sync-service.ts`、`references/shijian-clipper/android/app/src/main/java/com/lulalulaluobo/wechatclipper/UpdateClient.kt`。
* 参考方案使用服务端游标、批次 ack 与插件本地游标；更新仅接受约定命名、带 GitHub SHA-256 digest 的 Release 资产，并比对当前安装证书。

## 已确认决策

* 创建新的 release keystore，放在仓库外的本机目录；构建时通过环境变量提供路径、alias 和口令，任务完成时向用户交付这些信息及证书指纹。
