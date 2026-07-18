// wechat.pb.js - PocketBase 后端微信公众号草稿同步代理

// ==========================================
// 1. 本地 KV 缓存工具 (基于 wechat_kv SQLite 表)
// ==========================================
function getWechatCache(app, key) {
  try {
    const record = app.findFirstRecordByFilter("wechat_kv", "key = {:key}", { key: key });
    if (!record) return null;
    return record.get("value");
  } catch (_) {
    return null;
  }
}

function putWechatCache(app, key, value) {
  try {
    let record;
    try {
      record = app.findFirstRecordByFilter("wechat_kv", "key = {:key}", { key: key });
    } catch (_) {
      const collection = app.findCollectionByNameOrId("wechat_kv");
      record = new Record(collection);
      record.set("key", key);
    }
    record.set("value", value);
    app.save(record);
  } catch (err) {
    console.error("[WeChat Cache] 保存缓存失败: " + err.message);
  }
}

// Base64 纯 JS 解码为 Uint8Array (防止 goja 中 atob 不可用)
function base64ToUint8Array(base64) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const lookup = new Uint8Array(256);
  for (let i = 0; i < chars.length; i++) {
    lookup[chars.charCodeAt(i)] = i;
  }
  
  let bufferLength = base64.length * 0.75;
  if (base64[base64.length - 1] === "=") {
    bufferLength--;
    if (base64[base64.length - 2] === "=") {
      bufferLength--;
    }
  }
  
  const bytes = new Uint8Array(bufferLength);
  let p = 0;
  for (let i = 0; i < base64.length; i += 4) {
    const code1 = lookup[base64.charCodeAt(i)];
    const code2 = lookup[base64.charCodeAt(i + 1)];
    const code3 = lookup[base64.charCodeAt(i + 2)];
    const code4 = lookup[base64.charCodeAt(i + 3)];
    
    bytes[p++] = (code1 << 2) | (code2 >> 4);
    if (p < bufferLength) bytes[p++] = ((code2 & 15) << 4) | (code3 >> 2);
    if (p < bufferLength) bytes[p++] = ((code3 & 3) << 6) | (code4 & 63);
  }
  return bytes;
}

// 构造 Multipart/form-data Raw Body 字节数组
function buildMultipartBody(boundary, fieldName, filename, fileMime, fileBase64) {
  const header = "--" + boundary + "\r\n" +
                 "Content-Disposition: form-data; name=\"" + fieldName + "\"; filename=\"" + filename + "\"\r\n" +
                 "Content-Type: " + fileMime + "\r\n\r\n";
  const footer = "\r\n--" + boundary + "--\r\n";

  const headerBytes = new Uint8Array(header.length);
  for (let i = 0; i < header.length; i++) {
    headerBytes[i] = header.charCodeAt(i);
  }

  const footerBytes = new Uint8Array(footer.length);
  for (let i = 0; i < footer.length; i++) {
    footerBytes[i] = footer.charCodeAt(i);
  }

  const fileBytes = base64ToUint8Array(fileBase64);

  const totalBytes = new Uint8Array(headerBytes.length + fileBytes.length + footerBytes.length);
  totalBytes.set(headerBytes, 0);
  totalBytes.set(fileBytes, headerBytes.length);
  totalBytes.set(footerBytes, headerBytes.length + fileBytes.length);

  return totalBytes;
}

// ==========================================
// 2. 微信 API 操作封装
// ==========================================
const TOKEN_SAFETY_MARGIN_MS = 300000; // 5分钟安全空间
const DEFAULT_COVER_KEY = "wechat:default-cover-media-id";

function getAccessToken(app, appId, appSecret) {
  const cacheKey = "wechat:token:" + appId;
  const cachedRaw = getWechatCache(app, cacheKey);
  if (cachedRaw) {
    try {
      const cached = JSON.parse(cachedRaw);
      if (cached.token && cached.expiresAt > Date.now() + TOKEN_SAFETY_MARGIN_MS) {
        return cached.token;
      }
    } catch (_) {}
  }

  const url = "https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=" + encodeURIComponent(appId) + "&secret=" + encodeURIComponent(appSecret);
  const res = $http.send({ url: url, method: "GET" });
  if (res.statusCode !== 200) {
    throw new Error("微信 Token 接口连接失败 (" + res.statusCode + ")");
  }

  const data = JSON.parse(res.raw);
  if (data.errcode) {
    throw new Error("微信 API 错误: " + data.errmsg + " (代码: " + data.errcode + ")");
  }

  const token = data.access_token;
  const expiresIn = data.expires_in || 7200;
  const expiresAt = Date.now() + (expiresIn * 1000);

  putWechatCache(app, cacheKey, JSON.stringify({ token: token, expiresAt: expiresAt }));
  return token;
}

function uploadCover(app, appId, appSecret, mimeType, base64Data) {
  const token = getAccessToken(app, appId, appSecret);
  const boundary = "----WebKitFormBoundary" + Math.random().toString(36).slice(2);
  const extension = mimeType === "image/jpeg" ? "jpg" : mimeType.slice("image/".length);
  
  const multipartBody = buildMultipartBody(boundary, "media", "voicenest-cover." + extension, mimeType, base64Data);

  const url = "https://api.weixin.qq.com/cgi-bin/material/add_material?access_token=" + encodeURIComponent(token) + "&type=image";
  const res = $http.send({
    url: url,
    method: "POST",
    headers: {
      "Content-Type": "multipart/form-data; boundary=" + boundary
    },
    body: multipartBody
  });

  if (res.statusCode !== 200) {
    throw new Error("微信素材上传接口请求失败 (" + res.statusCode + ")");
  }

  const data = JSON.parse(res.raw);
  if (data.errcode) {
    throw new Error("微信 API 错误: " + data.errmsg + " (代码: " + data.errcode + ")");
  }

  return data.media_id;
}

function createDraft(app, appId, appSecret, article) {
  const token = getAccessToken(app, appId, appSecret);
  const url = "https://api.weixin.qq.com/cgi-bin/draft/add?access_token=" + encodeURIComponent(token);
  
  const res = $http.send({
    url: url,
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ articles: [article] })
  });

  if (res.statusCode !== 200) {
    throw new Error("微信草稿创建接口请求失败 (" + res.statusCode + ")");
  }

  const data = JSON.parse(res.raw);
  if (data.errcode) {
    throw new Error("微信 API 错误: " + data.errmsg + " (代码: " + data.errcode + ")");
  }

  return data.media_id;
}

function updateDraft(app, appId, appSecret, mediaId, article) {
  const token = getAccessToken(app, appId, appSecret);
  const url = "https://api.weixin.qq.com/cgi-bin/draft/update?access_token=" + encodeURIComponent(token);
  
  const res = $http.send({
    url: url,
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      media_id: mediaId,
      index: 0,
      articles: article
    })
  });

  if (res.statusCode !== 200) {
    throw new Error("微信草稿更新接口请求失败 (" + res.statusCode + ")");
  }

  const data = JSON.parse(res.raw);
  if (data.errcode) {
    throw new Error("微信 API 错误: " + data.errmsg + " (代码: " + data.errcode + ")");
  }

  return mediaId;
}

// ==========================================
// 3. 简易 Markdown 内联微信样式编译器
// ==========================================
function normalizeWechatMarkdown(source) {
  return source.replace(/^[\t ]*(?:[-+*]|\d+[.)])[\t ]*(?:\r?\n|$)/gm, '');
}

function renderWechatHtml(source) {
  let html = normalizeWechatMarkdown(source).trim();
  
  const blockStyles = {
    h1: 'margin:0 0 28px;font-size:24px;line-height:1.45;font-weight:700;color:#1f2329;',
    h2: 'margin:34px 0 16px;padding-left:10px;border-left:4px solid #07c160;font-size:20px;line-height:1.5;font-weight:700;color:#1f2329;',
    h3: 'margin:26px 0 12px;font-size:17px;line-height:1.6;font-weight:700;color:#1f2329;',
    p: 'margin:0 0 14px;font-size:16px;line-height:1.75;color:#2c2c2c;letter-spacing:0.02em;',
    blockquote: 'margin:20px 0;padding:12px 16px;border-left:4px solid #07c160;background:#f6fbf7;color:#57606a;',
    hr: 'margin:30px 0;border:0;border-top:1px solid #e7e7e7;'
  };
  
  html = html.split('\n\n').map(p => {
    p = p.trim();
    if (!p) return '';
    
    if (p.startsWith('# ')) {
      return `<h1 style="${blockStyles.h1}">${p.slice(2)}</h1>`;
    } else if (p.startsWith('## ')) {
      return `<h2 style="${blockStyles.h2}">${p.slice(3)}</h2>`;
    } else if (p.startsWith('### ')) {
      return `<h3 style="${blockStyles.h3}">${p.slice(4)}</h3>`;
    } else if (p.startsWith('> ')) {
      return `<blockquote style="${blockStyles.blockquote}">${p.slice(2)}</blockquote>`;
    } else if (p === '---' || p === '***') {
      return `<hr style="${blockStyles.hr}">`;
    } else {
      let inner = p.replace(/\*\*(.*?)\*\*/g, '<strong style="font-weight:700;color:#1f2329;">$1</strong>');
      inner = inner.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" style="color:#576b95;text-decoration:underline;">$1</a>');
      return `<p style="${blockStyles.p}">${inner}</p>`;
    }
  }).join('\n');
  
  return html;
}

// 统一错误处理器
function handleApiError(err, c) {
  console.error("[WeChat API] 处理失败: " + err.message);
  let statusCode = 500;
  let code = "INTERNAL_ERROR";
  let message = err.message || "微信公众号服务暂时不可用";

  if (message.includes("代码: 40164") || message.includes("ip not in whitelist")) {
    statusCode = 422;
    code = "WECHAT_IP_NOT_ALLOWED";
    message = "公众号 IP 白名单未配置：" + message;
  } else if (message.includes("微信 API 错误")) {
    statusCode = 502;
    code = "WECHAT_API_ERROR";
  }

  return c.json(statusCode, { code: code, message: message });
}

// 检查是否具备用户授权和密钥配置
function getWechatConfig(c) {
  const authRecord = c.get("authRecord");
  if (!authRecord) {
    throw new Error("UNAUTHORIZED");
  }

  const rawConfig = authRecord.get("wechatDraftConfig");
  let config = {};
  try {
    config = typeof rawConfig === "string" ? JSON.parse(rawConfig) : (rawConfig || {});
  } catch (_) {}

  if (!config.enabled || !config.appId || !config.appSecret) {
    throw new Error("CONFIG_MISSING");
  }

  return config;
}

// ==========================================
// 4. 自定义路由注册
// ==========================================

routerAdd("POST", "/api/wechat/connection-test", (c) => {
  let config;
  try {
    config = getWechatConfig(c);
  } catch (err) {
    if (err.message === "UNAUTHORIZED") return c.json(401, { code: "UNAUTHORIZED", message: "未登录或登录会话已过期" });
    if (err.message === "CONFIG_MISSING") return c.json(400, { code: "CONFIG_MISSING", message: "请先在设置中启用微信草稿箱并配置 AppID/Secret" });
  }

  try {
    getAccessToken(c.app, config.appId, config.appSecret);
    return c.json(200, { ok: true });
  } catch (err) {
    return handleApiError(err, c);
  }
});

routerAdd("GET", "/api/wechat/cover", (c) => {
  let config;
  try {
    config = getWechatConfig(c);
  } catch (err) {
    if (err.message === "UNAUTHORIZED") return c.json(401, { code: "UNAUTHORIZED", message: "未登录" });
    if (err.message === "CONFIG_MISSING") return c.json(400, { code: "CONFIG_MISSING", message: "微信配置缺失" });
  }

  const coverMediaId = getWechatCache(c.app, DEFAULT_COVER_KEY + ":" + config.appId);
  return c.json(200, { configured: Boolean(coverMediaId) });
});

routerAdd("POST", "/api/wechat/cover", (c) => {
  let config;
  try {
    config = getWechatConfig(c);
  } catch (err) {
    if (err.message === "UNAUTHORIZED") return c.json(401, { code: "UNAUTHORIZED", message: "未登录" });
    if (err.message === "CONFIG_MISSING") return c.json(400, { code: "CONFIG_MISSING", message: "微信配置缺失" });
  }

  try {
    const data = c.requestInfo().body;
    let dataUrl = "";
    if (data && typeof data === "object") {
      dataUrl = data.dataUrl || "";
    } else {
      const parsed = JSON.parse(c.request().body); // 兼容有些时候body为raw json
      dataUrl = parsed.dataUrl || "";
    }

    if (!dataUrl.startsWith("data:image/")) {
      return c.json(400, { code: "INVALID_COVER", message: "封面图片格式无效，仅支持 PNG、JPEG 或 WebP" });
    }

    const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
    if (!match) {
      return c.json(400, { code: "INVALID_COVER", message: "封面图片格式解析失败" });
    }

    const mimeType = match[1];
    const base64Data = match[2];

    const mediaId = uploadCover(c.app, config.appId, config.appSecret, mimeType, base64Data);
    putWechatCache(c.app, DEFAULT_COVER_KEY + ":" + config.appId, mediaId);

    return c.json(200, { configured: true });
  } catch (err) {
    return handleApiError(err, c);
  }
});

routerAdd("POST", "/api/wechat/preview", (c) => {
  const authRecord = c.get("authRecord");
  if (!authRecord) {
    return c.json(401, { code: "UNAUTHORIZED", message: "未登录" });
  }

  try {
    const body = JSON.parse(c.request().body);
    const title = body.title || "";
    const markdown = body.markdown || "";

    if (!title.trim() || !markdown.trim()) {
      return c.json(400, { code: "INVALID_REQUEST", message: "标题和正文不能为空" });
    }

    const html = renderWechatHtml(markdown);
    return c.json(200, { title: title.trim(), html: html });
  } catch (err) {
    return c.json(500, { code: "INTERNAL_ERROR", message: err.message });
  }
});

routerAdd("POST", "/api/wechat/drafts", (c) => {
  let config;
  try {
    config = getWechatConfig(c);
  } catch (err) {
    if (err.message === "UNAUTHORIZED") return c.json(401, { code: "UNAUTHORIZED", message: "未登录" });
    if (err.message === "CONFIG_MISSING") return c.json(400, { code: "CONFIG_MISSING", message: "微信配置缺失" });
  }

  try {
    const body = JSON.parse(c.request().body);
    const requestId = body.requestId || "";
    const title = body.title || "";
    const markdown = body.markdown || "";
    const draftMediaId = body.draftMediaId || "";

    if (!requestId || !title.trim() || !markdown.trim()) {
      return c.json(400, { code: "INVALID_REQUEST", message: "请求 ID、标题与 Markdown 正文不能为空" });
    }

    // 1. 幂等性检查
    const cacheKey = "draft-request:" + config.appId + ":" + requestId;
    const cachedRaw = getWechatCache(c.app, cacheKey);
    if (cachedRaw) {
      try {
        const cached = JSON.parse(cachedRaw);
        if (cached.mediaId) {
          return c.json(200, { mediaId: cached.mediaId, reused: true });
        }
      } catch (_) {}
    }

    // 2. 检查公众号封面
    const coverMediaId = getWechatCache(c.app, DEFAULT_COVER_KEY + ":" + config.appId);
    if (!coverMediaId) {
      return c.json(422, { code: "COVER_NOT_CONFIGURED", message: "请先在设置中上传公众号默认封面" });
    }

    // 3. 渲染内联样式 HTML
    const content = renderWechatHtml(markdown);
    if (content.length >= 20000) {
      return c.json(400, { code: "INVALID_REQUEST", message: "整理后的文章过长，无法写入微信草稿" });
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
        mediaId = updateDraft(c.app, config.appId, config.appSecret, draftMediaId, article);
      } catch (err) {
        // 如果是无效 media_id (微信返回 40007)，退回到创建新草稿
        if (err.message.includes("40007") || err.message.toLowerCase().includes("invalid media_id")) {
          mediaId = createDraft(c.app, config.appId, config.appSecret, article);
        } else {
          throw err;
        }
      }
    } else {
      mediaId = createDraft(c.app, config.appId, config.appSecret, article);
    }

    // 5. 保存到幂等缓存中 (保留 7 天)
    putWechatCache(c.app, cacheKey, JSON.stringify({ mediaId: mediaId }));

    return c.json(200, { mediaId: mediaId, reused: false });
  } catch (err) {
    return handleApiError(err, c);
  }
});
