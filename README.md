# Voice Inbox

个人使用的本地优先语音收件箱，支持录音、本地分片保存、转写、笔记整理与 Obsidian 同步。API 密钥仅保存在当前设备的浏览器本地存储中。

## 本地运行

```bash
npm install
npm run dev
npm run test
npm run build
```

## 部署

Vercel 仅托管构建后的静态 PWA 文件，不需要后端、环境变量或 Vercel Function。手机测试需要通过 Vercel 提供的 HTTPS 地址访问；浏览器内的录音和 IndexedDB 数据始终保存在该手机本地。

若使用 Fast Note Sync，同步服务必须提供手机可访问的 HTTPS 地址，并正确配置 CORS；`localhost` 或 HTTP 地址无法从 HTTPS PWA 中访问。
