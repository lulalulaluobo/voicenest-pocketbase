# VoiceNest

个人使用的本地优先语音收件箱。录音、模型 API Key 与公众号配置均保存在用户自己的设备或 PocketBase 后端中。

## 项目用途

把一闪而过的想法变成可继续使用的内容：录音、转写、润色，再写入你的知识库或公众号草稿箱。

- 笔记工作流：`录音 → ASR 转文字 → LLM 按笔记类型润色 → 同步到 Obsidian`
- 公众号工作流：`录音 → ASR 转文字 → LLM 按公众号提示词改写 → 预览排版 → 保存到微信公众号草稿箱`

录音、文本和设置默认只保存在当前设备；你可以按需连接自己的 ASR、LLM、Obsidian 与微信公众号服务。

## 界面预览

<p align="center">
  <img src="docs/assets/recording-screen.png" alt="VoiceNest 录音页" width="30%">
  <img src="docs/assets/library-screen.png" alt="VoiceNest 音频列表页" width="30%">
  <img src="docs/assets/settings-screen.png" alt="VoiceNest 设置页" width="30%">
</p>

## 一句话交给 AI 部署

```text
请阅读当前 VoiceNest 仓库的 README.md，严格按“Docker 部署”一节完成部署；绝不输出、提交或泄露 .env 中的 VN_ENCRYPTION_KEY 或任何微信凭据。
```

## 本地运行

```bash
npm install
npm run dev
npm run test
npm run build
```

## Android

在 [GitHub Releases](https://github.com/lulalulaluobo/VoiceNest/releases/latest) 下载 `VoiceNest-*-debug.apk`。这是调试包；首次安装时，Android 可能要求允许此来源安装未知应用。

APK 首次启动时会要求填写 PocketBase 后端地址（即按下方「部署」一节你自己部署的服务地址）。地址仅保存在本机，可随时在「设置 → 后端连接」中修改。之后即可登录或注册账号。

应用数据、录音和配置仍仅保存在设备本地与你的 PocketBase 后端。

## 部署

VoiceNest 采用前后端一体的 PocketBase 部署：PocketBase 既托管前端静态 PWA，又承载用户认证、录音云端同步、微信公众号草稿代理。生产环境推荐 Docker 部署。

### 部署前准备

1. 准备一台可公网访问的服务器（或本地局域网测试机），已安装 Docker 与 Docker Compose。
2. 在微信公众号后台准备 AppID 和 AppSecret；部署后在 VoiceNest 设置页上传默认封面。
3. 生成 32 字节随机加密主密钥（用于后端 AES-256-GCM 加密微信 AppSecret）：

   ```bash
   openssl rand -base64 24 | head -c 32
   ```

4. 在仓库根目录复制环境变量文件并填入密钥：

   ```bash
   cp .env.example .env
   # 编辑 .env，把 VN_ENCRYPTION_KEY 填为上一步生成的 32 字节字符串
   ```

   `.env` 已被 Git 忽略。**切勿**提交、截图、贴入公开 Issue，或把它的值写入前端环境变量。
   缺失或长度不为 32 时，PocketBase 启动后微信加解密 hook 会直接抛错拒绝服务。

### Docker 部署

```bash
# 构建并启动（compose 会强制校验 VN_ENCRYPTION_KEY，未设置则拒绝启动）
docker compose up -d --build
```

服务启动后访问 `http://<服务器IP>:8090`。首次访问 `http://<服务器IP>:8090/_/` 创建管理员账号。

生产环境强烈建议在前面套一层 Caddy / Nginx 做 HTTPS 终止（手机 PWA 必须通过 HTTPS 访问）。

### 微信公众号 IP 白名单

在公众号后台的 API 调用 IP 白名单中加入你部署服务器的出口公网 IP，然后到 VoiceNest 设置页运行“测试连接”。

若使用 Fast Note Sync，同步服务必须提供手机可访问的 HTTPS 地址，并正确配置 CORS；`localhost` 或 HTTP 地址无法从 HTTPS PWA 中访问。
