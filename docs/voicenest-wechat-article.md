# 从一段录音，到 Obsidian 和公众号草稿箱：VoiceNest 使用指南

> 本文项目地址：
>
> https://github.com/lulalulaluobo/voicenest-pocketbase

> 最新 APK、Obsidian 插件和更新日志：
>
> https://github.com/lulalulaluobo/voicenest-pocketbase/releases

## 重构初衷

<!-- 此处由作者补充重构初衷。 -->

## 5 分钟上手

VoiceNest 提供公共后端。普通用户不需要部署 Docker、配置服务器或维护数据库：安装 APK 或打开 PWA，注册账号，再配置自己的 ASR 与文本模型 API Key，即可开始使用。

### 1. 安装 APK 并连接公共后端

从 Releases 页面下载最新的 `release.apk` 并安装。首次打开后，选择“使用免费公共后端”，或在设置中填入：

```text
https://voicenest.lucc.fun
```

注册并登录后，录音、原始音频、转写文本和模型 API Key 都保存在你的设备本地。公共后端主要用于账号、Obsidian 同步队列，以及微信公众号草稿箱所需的固定 IP 代理服务。

### 2. 申请 ASR API Key：把录音转成文字

VoiceNest 默认可使用阶跃星辰的 `stepaudio-2.5-asr` 模型。

前往阶跃开放平台注册账号：

```text
https://platform.stepfun.com/
```

进入控制台创建 API Key，然后在 VoiceNest 的“设置 → ASR 服务”中填入：

- 服务商：阶跃星辰
- 模型：`stepaudio-2.5-asr`
- API Key：刚刚创建的 Key

如果注册页或控制台显示有新人 15 元赠金，可以先用该额度体验；活动和赠金会调整，请以控制台实际显示为准。`stepaudio-2.5-asr` 的公开价格是 **0.15 元/小时**，官方定价页：

```text
https://stepfun.mintlify.app/zh/guides/pricing/details
```

### 3. 配置文本整理：DeepSeek V4 Flash

录音转写完成后，VoiceNest 会使用 LLM 将口语内容整理为标题、摘要和结构化笔记。推荐配置：

- 服务：DeepSeek
- Base URL：`https://api.deepseek.com`
- 模型：`deepseek-v4-flash`
- API Key：在 DeepSeek 开放平台创建

DeepSeek 开放平台：

```text
https://platform.deepseek.com/
```

DeepSeek V4 Flash 当前按 Token 计费。未命中缓存的输入为 `$0.14 / 百万 Token`，输出为 `$0.28 / 百万 Token`。价格会调整，以官方定价页为准：

```text
https://api-docs.deepseek.com/quick_start/pricing/
```

### 4. 一段 10 分钟录音，实际大约多少钱？

按一段普通中文 10 分钟录音估算：

| 项目 | 估算方式 | 费用 |
| --- | --- | --- |
| ASR 转写 | `0.15 元/小时 × 10/60` | 约 ¥0.025 |
| DeepSeek 整理 | 约 3,000 输入 Token + 2,000 输出 Token | 约 ¥0.007 |
| 合计 | 转写 + 整理 | **约 ¥0.032** |

也就是说，一段 10 分钟录音从语音变成整理好的笔记，大约 **3 分钱左右**。实际费用会随录音内容、提示词长度、输出篇幅、汇率和平台价格变化而变化。

如果阶跃账户实际获得 15 元 ASR 赠金，单看 ASR 转写，约可覆盖 100 小时、即约 600 段 10 分钟录音；DeepSeek 的费用由 DeepSeek 账户单独结算。

### 5. 安装 Obsidian 同步插件

VoiceNest 不再使用双向 FNS 同步，而是改为更可控的 Obsidian 本地插件单向同步：手机或 PWA 产生笔记，插件拉取后写入你的 Vault。

先在 Obsidian 的社区插件市场安装并启用 **BRAT**，然后：

1. 打开“设置 → BRAT → Add Beta plugin”。
2. 在仓库地址中粘贴：

   ```text
   https://github.com/lulalulaluobo/voicenest-pocketbase
   ```

3. 点击添加，等待 BRAT 自动下载安装。
4. 回到“设置 → 社区插件”，启用 **VoiceNest Sync**。
5. 在 VoiceNest 的“设置 → Obsidian 本地插件同步”中点击“生成插件同步 Token”。
6. 将 Token 粘贴到 Obsidian 插件设置中，并填写后端地址：

   ```text
   https://voicenest.lucc.fun
   ```

插件会以 `pull → 写入 Vault → ack → cursor` 的方式单向同步。只有文件成功写入 Obsidian 后，插件才会确认该记录；断网或写入失败时，下一次同步会自动重试。文件名使用笔记标题，唯一 ID 会保留在 Markdown 的 YAML 元数据中，避免重名导致内容混乱。

### 6. 同步到微信公众号草稿箱

VoiceNest 的公众号功能只会把文章写入“草稿箱”，不会自动发布。你仍然可以在公众号后台审阅、编辑后再决定是否群发。

这里有两个必要步骤。

#### 第一步：获取微信公众号 AppID 和 AppSecret

登录微信公众平台：

```text
https://mp.weixin.qq.com/
```

进入：

```text
设置与开发 → 基本配置
```

找到“开发者 ID”，复制：

- `AppID`
- `AppSecret`

回到 VoiceNest：

```text
设置 → 公众号草稿箱
```

启用公众号功能，填入 AppID 和 AppSecret，点击“保存微信配置”。

AppSecret 只应填写在自己的 VoiceNest 设置中，不要发送给他人或截图公开。公共后端会加密保存它，用于代表你的公众号请求微信接口；客户端无法再读取完整 Secret。

此外，请确认你的公众号具备素材管理和草稿箱相关接口权限。若“测试公众号连接”提示授权失败，请先在公众号后台检查账号类型、认证状态与接口权限。

#### 第二步：在微信后台添加出口 IP 白名单

微信公众号接口要求请求来自已登记的固定公网 IP。使用 VoiceNest 公共后端时，请在微信公众平台的“基本配置 → IP 白名单”中加入：

```text
45.89.232.152
```

保存后，回到 VoiceNest 点击“测试公众号连接”。测试通过后，再上传一张默认封面图，就可以把整理后的内容写入公众号草稿箱。

这里容易混淆：使用公共后端时，你不需要、也无法在手机 App 中“修改出口 IP”。出口 IP 由公共后端服务器决定；你要做的是在微信公众号后台的 **IP 白名单** 中添加它。

如果未来改用自己的服务器部署 VoiceNest，则需要把自己服务器实际访问 `api.weixin.qq.com` 时使用的公网出口 IP 加入白名单。更换 VPS、调整 NAT 或更换弹性公网 IP 后，也要先更新微信公众号白名单，再测试草稿箱连接。
