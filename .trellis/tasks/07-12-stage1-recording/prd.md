# 阶段 1：录音与本地列表设计说明

**状态**：已获用户确认  
**目标**：交付一个可部署到 Vercel、可在 Android Chrome 与 iPhone Safari 使用的离线录音 PWA。

## 已确认的范围

- 使用 React、TypeScript、Vite、React Router、Dexie 与 `vite-plugin-pwa`。
- 使用浏览器原生 `MediaRecorder`，每约 5 秒将一个音频分片写入 IndexedDB。
- 录音支持开始、暂停、继续、完成、异常恢复、本地播放与二次确认删除。
- 实现主页、录音列表、录音详情、设置页与底部导航，视觉以根目录的 `Voice Inbox PWA - UI Prototype.html` 为准。
- 内置只读示例类型：随想、日记、会议、项目；类型管理在阶段 2 实现。
- 部署产物为 Vercel 静态站点；本阶段不建设后端、函数、环境变量、API Key、转写、LLM、同步或任务队列。

## 非范围

- 笔记类型的新增、编辑、删除、排序和默认类型。
- API 配置、音频上传、转写、整理、Obsidian 同步、通知、备份和保留策略。
- 录音波形、后台或锁屏录音、跨设备同步。

## 开源调研与采用结论

已克隆 `references/vite-plugin-pwa`（MIT）作为 PWA 配置参考。

- 借鉴：Vite 插件生成 manifest、Service Worker 和静态资源预缓存的模块边界。
- 不借鉴：其业务实现与示例页面；应用录音和本地持久化保持独立。
- 录音不引入封装库：原生 `MediaRecorder` 才能直接控制 MIME 选择、5 秒分片、暂停和异常恢复。

## 架构

```text
React 页面与路由
  ├─ useRecorder：权限、MediaRecorder、计时、Wake Lock、事件处理
  ├─ recordingStore：Dexie 事务、录音元数据与分片 CRUD
  └─ MIME 选择：按浏览器能力选择候选格式
       └─ IndexedDB（recordings / audioChunks）
```

- 启动录音前创建 `recording` 元数据，状态为 `recording`。
- `dataavailable` 每约 5 秒产生一个非空 Blob，并立即写入 `audioChunks`。
- 正常停止后写入最终分片、停止媒体轨道、更新时长与状态 `ready`。
- 应用启动时发现 `recording` 状态的条目，保留已写入分片并标记为 `recovered`；媒体轨道结束等中断标记为 `interrupted`。
- 用 `MediaRecorder.isTypeSupported()` 从候选 MIME 中选择浏览器实际支持的格式，并在元数据中保存实际 MIME；不能选定时让浏览器使用默认格式。
- 读取播放时按分片顺序合成为一个 Blob，再交给原生 `<audio controls>` 播放。

## 本地数据

`recordings` 仅保存阶段 1 所需字段：`id`、创建/更新时间、类型 ID 与名称、时长、实际 MIME、分片 ID、状态、是否恢复/中断和本地标题。

`audioChunks` 保存：`id`、`recordingId`、顺序号、创建时间、Blob 和字节数。

删除录音必须在一个 Dexie 事务内删除元数据及其全部分片。后续处理相关字段不提前写入。

## 页面与交互

| 页面 | 行为 |
| --- | --- |
| 主页 `/` | 显示示例类型、录音按钮、录音状态与最近两条录音；完成后置顶、滚动并高亮 2 秒。 |
| 列表 `/recordings` | 显示本地录音及阶段 1 状态筛选。 |
| 详情 `/recordings/:id` | 播放音频、显示录音元数据、二次确认删除。 |
| 设置 `/settings` | 实现系统主题跟随；模型、同步、备份等仅明确显示为后续阶段。 |

录音页面不显示波形。暂停期间不累计时长。所有图标按钮有可访问名称，状态同时使用文字与颜色。

## 可靠性与错误处理

- 检查安全上下文、`getUserMedia`、`MediaRecorder` 和可用 MIME；不满足时给出中文提示。
- 权限被拒绝、无设备、设备被占用、录音器错误与存储写入失败都停止后续录音，但保留已持久化分片。
- 尝试请求 Wake Lock；不支持或请求失败时继续录音，不把它当作错误。
- Service Worker 更新不在录音期间强制刷新页面。

## 验证与验收

- 自动化：验证 MIME 选择顺序、Dexie 分片保存/恢复/级联删除，且生产构建成功。
- 手动真机：Android Chrome 与 iPhone Safari 分别验证授权、开始/暂停/继续/完成、播放、刷新恢复、删除、安装到桌面与深色模式。
- 部署：Vercel 托管静态构建产物，使用 `*.vercel.app` HTTPS 地址；本阶段不添加 Vercel 函数或秘密配置。

## 设计自检

- 无占位决策或未确认的功能范围。
- 数据模型、录音流程与页面行为一致。
- 录音分片、恢复与双浏览器兼容性均有对应验收。
- 范围限定在 PRD 的阶段 1，未提前实现后续处理链路。
