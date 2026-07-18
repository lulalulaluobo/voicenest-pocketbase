// FNS 同源转发：仅转发用户当前请求中携带的 Token，绝不保存。

routerAdd("POST", "/api/fns/connection-test", (e) => {
  const H = require(`${__hooks}/fns_helpers.js`);
  if (!e.auth) return e.json(401, { code: "UNAUTHORIZED", message: "请先登录" });

  try {
    const limited = require(`${__hooks}/wechat_helpers.js`).enforceRateLimit(e, "fns-connection-test", 20, 60);
    if (limited) return limited;
    const config = H.readConfig(H.parseBody(e));
    const result = H.send(config.api, config.apiToken, "GET", "/api/user/info");
    return e.json(result.statusCode, result.data);
  } catch (err) {
    console.error("[FNS proxy] 连接测试失败");
    return e.json(400, { code: "FNS_CONNECTION_FAILED", message: err && err.message ? err.message : "无法连接 FNS" });
  }
}, $apis.requireAuth());

routerAdd("POST", "/api/fns/note", (e) => {
  const H = require(`${__hooks}/fns_helpers.js`);
  if (!e.auth) return e.json(401, { code: "UNAUTHORIZED", message: "请先登录" });

  try {
    const limited = require(`${__hooks}/wechat_helpers.js`).enforceRateLimit(e, "fns-note", 60, 60);
    if (limited) return limited;
    const body = H.parseBody(e);
    const config = H.readConfig(body);
    const note = H.readNote(body);
    const result = H.send(config.api, config.apiToken, "POST", "/api/note", note);
    return e.json(result.statusCode, result.data);
  } catch (err) {
    console.error("[FNS proxy] 笔记写入失败");
    return e.json(400, { code: "FNS_NOTE_FAILED", message: err && err.message ? err.message : "FNS 笔记写入失败" });
  }
}, $apis.requireAuth());
