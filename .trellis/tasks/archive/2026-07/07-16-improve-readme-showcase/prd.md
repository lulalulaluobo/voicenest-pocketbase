# 完善 README 项目介绍与截图

## Goal

让开源仓库首页清楚说明 VoiceNest 的用途、从录音到 Obsidian/微信公众号草稿箱的工作流，并展示三张真实界面截图。

## What I already know

- 用户提供三张界面截图：录音页、音频列表页与设置页。
- README 已有本地运行、Android、部署和完整 AI 部署流程。
- 截图当前位于临时目录，必须复制为仓库内可跟踪的文档资源。

## Requirements

- 在 `docs/assets/` 保存三张截图，并在 README 中相对引用。
- 增加项目用途与两条准确的工作流：笔记同步和公众号草稿。
- 增加一条可复制的 AI 部署提示词，指向 README 现有的完整部署流程。
- 保留现有部署与安全说明。

## Acceptance Criteria

- [x] README 在 GitHub 上能显示三张截图。
- [x] README 明确描述录音、ASR、LLM、Obsidian 和微信公众号草稿箱流程。
- [x] README 含有一条不泄露 `.dev.vars` 的 AI 部署提示词。
- [x] 只提交 README、截图和任务记录；不提交测试 Worker 配置。

## Out of Scope

- 不修改应用功能、部署逻辑或截图内容。
