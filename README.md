# Voice Inbox

个人使用的本地优先语音收件箱。阶段 1 支持录音、本地分片保存、恢复、播放与删除；不包含转写、同步或任何云端密钥。

## 本地运行

```bash
npm install
npm run dev
npm run test
npm run build
```

## 部署

Vercel 仅托管构建后的静态 PWA 文件，不需要后端、环境变量或 Vercel Function。手机测试需要通过 Vercel 提供的 HTTPS 地址访问；浏览器内的录音和 IndexedDB 数据始终保存在该手机本地。
