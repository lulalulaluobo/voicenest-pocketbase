// FNS 同源转发的共享校验与请求工具。

const MAX_API_URL_LENGTH = 512;
const MAX_TOKEN_LENGTH = 4096;
const MAX_VAULT_LENGTH = 256;
const MAX_NOTE_PATH_LENGTH = 1024;
const MAX_NOTE_CONTENT_LENGTH = 512 * 1024;

function parseBody(e) {
  const body = e.requestInfo().body;
  if (body && typeof body === "object") return body;
  if (typeof body === "string") return JSON.parse(body);
  return {};
}

function normalizePublicHttpsApi(value) {
  const api = String(value || "").trim().replace(/\/+$/, "");
  if (!api || api.length > MAX_API_URL_LENGTH) throw new Error("FNS 地址无效");

  const match = /^https:\/\/([a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)(?::([0-9]{1,5}))?$/i.exec(api);
  if (!match) throw new Error("FNS 必须使用公共 HTTPS 域名，且不能包含路径或查询参数");

  const host = match[1].toLowerCase();
  if (!host.includes(".") || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("FNS 地址不能指向本地或内网服务");
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) throw new Error("FNS 请使用公网域名，不支持直接填写 IP 地址");

  const port = match[2] ? Number(match[2]) : 443;
  if (port < 1 || port > 65535) throw new Error("FNS 端口无效");
  return api;
}

function readConfig(body) {
  const api = normalizePublicHttpsApi(body.api);
  const apiToken = String(body.apiToken || "").trim();
  if (!apiToken || apiToken.length > MAX_TOKEN_LENGTH) throw new Error("FNS Token 无效");
  return { api: api, apiToken: apiToken };
}

function readNote(body) {
  const vault = String(body.vault || "").trim();
  const path = String(body.path || "").trim();
  const content = String(body.content || "");
  if (!vault || vault.length > MAX_VAULT_LENGTH || !path || path.length > MAX_NOTE_PATH_LENGTH || content.length > MAX_NOTE_CONTENT_LENGTH) {
    throw new Error("FNS 笔记内容无效或过大");
  }
  return {
    vault: vault,
    path: path,
    content: content,
    createOnly: Boolean(body.createOnly)
  };
}

function send(api, apiToken, method, endpoint, body) {
  const options = {
    url: api + endpoint,
    method: method,
    headers: {
      "token": apiToken,
      // 复用 FNS 官方 Obsidian 插件使用的客户端范围，兼容既有 Token。
      "X-Client": "ObsidianPlugin"
    }
  };
  if (body) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }

  const response = $http.send(options);
  let data;
  try {
    data = JSON.parse(response.raw || "{}");
  } catch (_) {
    throw new Error("FNS 返回了无效响应");
  }
  return { statusCode: response.statusCode, data: data };
}

module.exports = {
  parseBody: parseBody,
  readConfig: readConfig,
  readNote: readNote,
  send: send
};
