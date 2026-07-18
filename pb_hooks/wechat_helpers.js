// wechat_helpers.js - 微信 hook 的共享工具函数模块
// PocketBase JSVM 限制：handler 内无法访问文件级函数，必须用 require() 加载共享模块。
// 参考: https://pocketbase.io/docs/js-overview/#caveats-and-limitations


//
// 兼容性：v0.23+ hooks API（routerAdd 回调签名 e.*、e.auth、e.requestInfo().body 等）
// 服务端版本要求：PocketBase >= 0.23（生产推荐 0.27.x，与前端 SDK 对齐）


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



// ==========================================
// 2. AES-256-GCM 安全加解密工具
// ==========================================
// PocketBase $security.encrypt/decrypt 使用 AES-256-GCM，要求 key 必须正好 32 字节。
// 文档：https://pocketbase.io/jsvm/functions/_security.encrypt.html
//
// 安全策略：
//   - 缺失或长度不为 32 时直接抛错拒绝启动，绝不降级到硬编码备用密钥
//   - key 通过环境变量 VN_ENCRYPTION_KEY 注入（Dockerfile ARG + compose environment）
//   - 生成方法：openssl rand -base64 24 | head -c 32
function getMasterEncryptionKey() {
  const key = $os.getenv("VN_ENCRYPTION_KEY") || "";
  if (key.length !== 32) {
    throw new Error(
      "[FATAL] VN_ENCRYPTION_KEY 必须是 32 字节随机字符串，当前未配置或长度不为 32。" +
      "生成方法：openssl rand -base64 24 | head -c 32"
    );
  }
  return key;
}



// Base64 纯 JS 解码为 Uint8Array
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
// 4. 简易 Markdown 内联微信样式编译器
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
function handleApiError(err, e) {
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

  return e.json(statusCode, { code: code, message: message });
}



// 安全提取与解密微信 AppSecret 凭据
function getWechatCredentials(app, authRecord) {
  try {
    const record = app.findFirstRecordByFilter("wechat_accounts", "owner = {:owner}", { owner: authRecord.id });
    if (!record) return null;

    const appId = record.get("appId");
    const encrypted = record.get("encryptedSecret");
    if (!appId || !encrypted) return null;

    const key = getMasterEncryptionKey();
    const appSecret = $security.decrypt(encrypted, key);
    return { appId: appId, appSecret: appSecret };
  } catch (_) {
    return null;
  }
}



// ==========================================
// 5. 轻量 IP 限流（基于 wechat_kv 计数器）
// ==========================================
// PocketBase 0.27 全局 RateLimit 中间件粒度过粗且需 admin 手动配置，
// 这里对敏感自定义路由做 per-route IP 计数。
// 副作用：过期计数记录会累积在 wechat_kv，下版加 cron 清理。
function checkRateLimit(app, routeKey, ip, maxRequests, windowSec) {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % windowSec);
  const entryKey = "ratelimit:" + routeKey + ":" + ip + ":" + windowStart;

  let count = 0;
  try {
    const raw = getWechatCache(app, entryKey);
    count = raw ? parseInt(raw, 10) || 0 : 0;
  } catch (_) {}

  count += 1;
  putWechatCache(app, entryKey, String(count));
  return count <= maxRequests;
}



function enforceRateLimit(e, routeKey, maxRequests, windowSec) {
  // realClientIp 在某些部署环境下可能为空（如直连 127.0.0.1），
  // 降级取 X-Forwarded-For；仍为空则用 "unknown" 占位以保证限流始终生效。
  let ip = e.requestInfo().realClientIp;
  if (!ip) {
    try {
      ip = e.requestInfo().headers["x-forwarded-for"] || "";
      if (ip.indexOf(",") !== -1) ip = ip.split(",")[0].trim();
    } catch (_) {}
  }
  if (!ip) ip = "unknown";

  if (!checkRateLimit(e.app, routeKey, ip, maxRequests, windowSec)) {
    return e.json(429, { code: "RATE_LIMITED", message: "请求过于频繁，请稍后再试" });
  }
  return null;
}


// ==========================================
// 0. 请求体解析工具
// ==========================================
// PocketBase 0.27 中 e.requestInfo().body 对 JSON 请求返回已解析的对象（不是字符串），
// 对 form 请求返回键值对象，对原始 body 返回字符串。
// 此工具统一三种情况，返回普通对象。
function parseBody(e) {
  const raw = e.requestInfo().body;
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return {};
  }
}

module.exports = {
  getWechatCache: getWechatCache,
  putWechatCache: putWechatCache,
  getMasterEncryptionKey: getMasterEncryptionKey,
  base64ToUint8Array: base64ToUint8Array,
  buildMultipartBody: buildMultipartBody,
  getAccessToken: getAccessToken,
  uploadCover: uploadCover,
  createDraft: createDraft,
  updateDraft: updateDraft,
  normalizeWechatMarkdown: normalizeWechatMarkdown,
  renderWechatHtml: renderWechatHtml,
  handleApiError: handleApiError,
  getWechatCredentials: getWechatCredentials,
  checkRateLimit: checkRateLimit,
  enforceRateLimit: enforceRateLimit,
  parseBody: parseBody
};