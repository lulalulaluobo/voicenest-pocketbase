// wechat.pb.js - PocketBase 后端微信公众号凭证安全加密与代理同步

// 安全单向保存微信凭据接口
// requireAuth 中间件自动解析 Authorization header 到 e.auth；未登录则由中间件直接返回 401

// PocketBase JSVM 限制：每个 handler 在隔离 context 中执行，无法访问文件级函数。
// 必须在 handler 内 require 共享模块。这里在文件顶部预加载以便复用引用名 H。
// 但 handler 内仍需各自 require，因为顶层的 H 在 handler 内不可见。
// 实际 handler 内调用模式：const H = require(`${__hooks}/wechat_helpers.js`);

routerAdd("POST", "/api/wechat/setup-credential", (e) => {
  const H = require(`${__hooks}/wechat_helpers.js`);
  const authRecord = e.auth;
  if (!authRecord) {
    return e.json(401, { code: "UNAUTHORIZED", message: "未登录或登录会话已过期" });
  }

  const limited = H.enforceRateLimit(e, "wechat-setup", 10, 60);
  if (limited) return limited;

  try {
    const body = H.parseBody(e);
    const appId = body.appId || "";
    const appSecret = body.appSecret || "";

    if (!appId.trim() || appId.length > H.MAX_APP_ID_LENGTH || appSecret.length > H.MAX_APP_SECRET_LENGTH) {
      return e.json(400, { code: "INVALID_REQUEST", message: "微信公众号 AppID 不能为空" });
    }

    // 查询当前用户的记录
    let record;
    try {
      record = e.app.findFirstRecordByFilter("wechat_accounts", "owner = {:owner}", { owner: authRecord.id });
    } catch (_) {
      const collection = e.app.findCollectionByNameOrId("wechat_accounts");
      record = new Record(collection);
      record.set("owner", authRecord.id);
    }

    record.set("appId", appId.trim());

    // 只有在前端传了非空 AppSecret 时才进行加密并更新。若为空，则说明仅修改了 AppID 且沿用原密码。
    if (appSecret.trim()) {
      const key = H.getMasterEncryptionKey();
      const encrypted = $security.encrypt(appSecret.trim(), key);
      record.set("encryptedSecret", encrypted);
    }

    e.app.save(record);
    return e.json(200, { success: true, configured: true });
  } catch (err) {
    console.error("[WeChat API] 保存凭据失败: " + (err && err.message ? err.message : "未知错误"));
    return e.json(500, { code: "INTERNAL_ERROR", message: "保存微信凭据失败，请稍后重试" });
  }
}, $apis.requireAuth());

routerAdd("POST", "/api/wechat/connection-test", (e) => {
  const H = require(`${__hooks}/wechat_helpers.js`);
  const authRecord = e.auth;
  if (!authRecord) {
    return e.json(401, { code: "UNAUTHORIZED", message: "请先登录" });
  }

  const limited = H.enforceRateLimit(e, "wechat-conn-test", 10, 60);
  if (limited) return limited;

  const credentials = H.getWechatCredentials(e.app, authRecord);
  if (!credentials) {
    return e.json(400, { code: "CONFIG_MISSING", message: "请先在设置中配置微信公众号的 AppID 与 AppSecret" });
  }

  try {
    H.getAccessToken(e.app, credentials.appId, credentials.appSecret);
    return e.json(200, { ok: true });
  } catch (err) {
    return H.handleApiError(err, e);
  }
}, $apis.requireAuth());

routerAdd("GET", "/api/wechat/cover", (e) => {
  const H = require(`${__hooks}/wechat_helpers.js`);
  const authRecord = e.auth;
  if (!authRecord) {
    return e.json(401, { code: "UNAUTHORIZED", message: "未登录" });
  }

  const credentials = H.getWechatCredentials(e.app, authRecord);
  if (!credentials) {
    return e.json(200, { configured: false });
  }

  const coverMediaId = H.getWechatCache(e.app, H.DEFAULT_COVER_KEY + ":" + credentials.appId);
  return e.json(200, { configured: Boolean(coverMediaId) });
}, $apis.requireAuth());

routerAdd("POST", "/api/wechat/cover", (e) => {
  const H = require(`${__hooks}/wechat_helpers.js`);
  const authRecord = e.auth;
  if (!authRecord) {
    return e.json(401, { code: "UNAUTHORIZED", message: "未登录" });
  }

  const limited = H.enforceRateLimit(e, "wechat-cover", 10, 60);
  if (limited) return limited;

  const credentials = H.getWechatCredentials(e.app, authRecord);
  if (!credentials) {
    return e.json(400, { code: "CONFIG_MISSING", message: "微信配置缺失，请先在设置中填写密钥" });
  }

  try {
    const data = e.requestInfo().body;
    let dataUrl = "";
    if (data && typeof data === "object") {
      dataUrl = data.dataUrl || "";
    } else if (typeof data === "string") {
      const parsed = JSON.parse(data);
      dataUrl = parsed.dataUrl || "";
    }

    if (!dataUrl.startsWith("data:image/")) {
      return e.json(400, { code: "INVALID_COVER", message: "封面图片格式无效，仅支持 PNG、JPEG 或 WebP" });
    }

    const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
    if (!match) {
      return e.json(400, { code: "INVALID_COVER", message: "封面图片格式解析失败" });
    }

    const mimeType = match[1];
    const base64Data = match[2];
    if (base64Data.length > H.MAX_COVER_BASE64_LENGTH) {
      return e.json(413, { code: "COVER_TOO_LARGE", message: "封面图片不能超过 5 MiB" });
    }

    const mediaId = H.uploadCover(e.app, credentials.appId, credentials.appSecret, mimeType, base64Data);
    H.putWechatCache(e.app, H.DEFAULT_COVER_KEY + ":" + credentials.appId, mediaId);

    return e.json(200, { configured: true });
  } catch (err) {
    return H.handleApiError(err, e);
  }
}, $apis.requireAuth());

routerAdd("POST", "/api/wechat/preview", (e) => {
  const H = require(`${__hooks}/wechat_helpers.js`);
  const authRecord = e.auth;
  if (!authRecord) {
    return e.json(401, { code: "UNAUTHORIZED", message: "未登录" });
  }

  const limited = H.enforceRateLimit(e, "wechat-preview", 20, 60);
  if (limited) return limited;

  try {
    const body = H.parseBody(e);
    const title = body.title || "";
    const markdown = body.markdown || "";

    if (!title.trim() || !markdown.trim() || title.length > H.MAX_TITLE_LENGTH || markdown.length > H.MAX_MARKDOWN_LENGTH) {
      return e.json(400, { code: "INVALID_REQUEST", message: "标题和正文不能为空" });
    }

    const html = H.renderWechatHtml(markdown);
    return e.json(200, { title: title.trim(), html: html });
  } catch (err) {
    return e.json(500, { code: "INTERNAL_ERROR", message: "公众号预览失败，请稍后重试" });
  }
}, $apis.requireAuth());

routerAdd("POST", "/api/wechat/drafts", (e) => {
  const H = require(`${__hooks}/wechat_helpers.js`);
  const authRecord = e.auth;
  if (!authRecord) {
    return e.json(401, { code: "UNAUTHORIZED", message: "未登录" });
  }

  const limited = H.enforceRateLimit(e, "wechat-drafts", 10, 60);
  if (limited) return limited;

  const credentials = H.getWechatCredentials(e.app, authRecord);
  if (!credentials) {
    return e.json(400, { code: "CONFIG_MISSING", message: "微信配置缺失，请先在设置中填写密钥" });
  }

  try {
    const body = H.parseBody(e);
    const requestId = body.requestId || "";
    const title = body.title || "";
    const markdown = body.markdown || "";
    const draftMediaId = body.draftMediaId || "";

    if (!requestId || !title.trim() || !markdown.trim() || title.length > H.MAX_TITLE_LENGTH || markdown.length > H.MAX_MARKDOWN_LENGTH) {
      return e.json(400, { code: "INVALID_REQUEST", message: "请求 ID、标题与 Markdown 正文不能为空" });
    }

    // 1. 幂等性检查
    const cacheKey = "draft-request:" + credentials.appId + ":" + requestId;
    const cachedRaw = H.getWechatCache(e.app, cacheKey);
    if (cachedRaw) {
      try {
        const cached = JSON.parse(cachedRaw);
        if (cached.mediaId) {
          return e.json(200, { mediaId: cached.mediaId, reused: true });
        }
      } catch (_) {}
    }

    // 2. 检查公众号封面
    const coverMediaId = H.getWechatCache(e.app, H.DEFAULT_COVER_KEY + ":" + credentials.appId);
    if (!coverMediaId) {
      return e.json(422, { code: "COVER_NOT_CONFIGURED", message: "请先在设置中上传公众号默认封面" });
    }

    // 3. 渲染内联样式 HTML
    const content = H.renderWechatHtml(markdown);
    if (content.length >= 20000) {
      return e.json(400, { code: "INVALID_REQUEST", message: "整理后的文章过长，无法写入微信草稿" });
    }

    const article = {
      title: title.trim(),
      content: content,
      thumb_media_id: coverMediaId,
      need_open_comment: 0,
      only_fans_can_comment: 0
    };

    // 4. 发送草稿创建/更新
    let mediaId;
    if (draftMediaId) {
      try {
        mediaId = H.updateDraft(e.app, credentials.appId, credentials.appSecret, draftMediaId, article);
      } catch (err) {
        if (err.message.includes("40007") || err.message.toLowerCase().includes("invalid media_id")) {
          mediaId = H.createDraft(e.app, credentials.appId, credentials.appSecret, article);
        } else {
          throw err;
        }
      }
    } else {
      mediaId = H.createDraft(e.app, credentials.appId, credentials.appSecret, article);
    }

    // 5. 保存到幂等缓存中 (保留 7 天)
    H.putWechatCache(e.app, cacheKey, JSON.stringify({ mediaId: mediaId }));

    return e.json(200, { mediaId: mediaId, reused: false });
  } catch (err) {
    return H.handleApiError(err, e);
  }
}, $apis.requireAuth());
