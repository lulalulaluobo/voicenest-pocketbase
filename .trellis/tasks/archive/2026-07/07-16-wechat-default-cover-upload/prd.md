# 公众号默认封面上传

## Goal

让每位部署者在 VoiceNest 设置页上传自己的默认封面图片；Worker 将其上传为微信公众号永久图片素材并保存其 `media_id`，后续草稿自动使用该用户的封面，无需在部署前手动寻找或填写 `WECHAT_COVER_MEDIA_ID`。

## What I already know

- 当前 Worker 已使用 `WECHAT_COVER_MEDIA_ID` Secret 为所有草稿填充 `thumb_media_id`。
- 历史封面生图方案已验证“前端图片 → Worker multipart 上传永久素材 → 草稿使用返回的 `media_id`”的链路，但生图功能已经删除。
- 当前设置页已有公众号服务配置区；现有 Worker 由 Access 和精确 CORS 保护。

## Requirements (evolving)

- 在设置页的公众号配置区提供默认封面图片选择、预览、上传与当前状态反馈。
- 将当前仓库中的默认封面图移至前端资源，作为首次配置时可见、可一键采用的示例默认封面；用户可用本地图片替换它。
- Worker 只接受受 Access/CORS 保护的图片上传，校验 PNG/JPEG/WebP、文件大小和图片数据。
- Worker 将图片上传为微信公众号永久图片素材，并将返回的 `media_id` 保存到部署者自己的 KV。
- 发布草稿时只使用 KV 中已保存的默认封面；未设置封面时给出可操作错误，不创建草稿。
- 完全删除 `WECHAT_COVER_MEDIA_ID` Secret、示例配置和旧回退逻辑；本次部署视为重新初始化。
- 前端在设置页请求默认封面是否已配置，并提供选择、预览和替换入口。

## Acceptance Criteria (evolving)

- [ ] 新部署用户无需填写 `WECHAT_COVER_MEDIA_ID` 即可部署 Worker。
- [ ] 用户上传一张合法图片后，公众号草稿使用该图片作为封面。
- [ ] 非法 MIME、过大图片、未上传封面和微信上传失败均有中文错误，不创建草稿。
- [ ] 设置页刷新后能显示“已配置”或“未配置”，且不会暴露 `media_id`。
- [ ] 未配置时设置页展示内置示例封面；点击“使用默认封面”后，该图片被上传到当前用户自己的公众号素材库。
- [ ] `WECHAT_COVER_MEDIA_ID` 不再出现在 Worker 类型、Wrangler、示例配置或部署文档。

## Out of Scope

- AI 生图、每篇文章单独封面、图片云备份、跨设备同步、正文图片和自动正式发布。

## Technical Notes

- `POST /cover` 接受单张图片 data URL，校验后以 `FormData` 上传微信公众号永久 `image` 素材；`GET /cover` 只返回是否已配置，不返回 `media_id`。内置图片只存在前端构建产物，首次点击使用时才上传到各自公众号。
- 默认封面 KV 记录不设置过期时间；不恢复 Agnes 或任何生图依赖。
- 参考 `references/wechat-publisher/references/api_reference.md`：封面必须调用 `material/add_material?type=image`，其返回 `media_id` 才能作为 `thumb_media_id`；不得误用只返回正文 URL 的 `media/uploadimg`。
- 受影响区域：`workers/wechat-draft`、`src/lib/wechat.ts`、`src/pages/SettingsPage.tsx`、本地配置与备份边界。
