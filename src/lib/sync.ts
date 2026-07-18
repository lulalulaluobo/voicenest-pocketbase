export interface SyncConfig {
  api: string
  apiToken: string
  vault: string
}

export function isObsidianConfigured(config: SyncConfig): boolean {
  return Boolean(config.apiToken.trim() && config.vault.trim())
}

async function fetchWithProxy(url: string, options: RequestInit): Promise<Response> {
  try {
    return await fetch(url, options)
  } catch (err: any) {
    const isPublic = /^https?:\/\//i.test(url) && !url.includes('localhost') && !url.includes('127.0.0.1')
    if (isPublic) {
      console.warn('直连失败或遇到 CORS 跨域拦截，尝试降级通过 Vercel 代理转发:', url)
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      const proxyBase = isLocalhost ? 'https://codex-stage1-recording.vercel.app' : ''
      const proxyUrl = `${proxyBase}/api/proxy?url=${encodeURIComponent(url)}`
      return await fetch(proxyUrl, options)
    }
    throw err
  }
}

export function assertSecureSyncEndpoint(api: string): string {
  let parsed: URL
  try {
    parsed = new URL(api)
  } catch {
    throw new Error('Fast Note Sync 地址必须是有效的 HTTPS URL。')
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('Fast Note Sync 必须使用 HTTPS 地址；手机 PWA 无法访问 localhost 或 HTTP 服务。')
  }

  return parsed.toString().replace(/\/+$/, '')
}

export function normalizeObsidianDirectory(directory: string): string {
  const segments = directory.split('/').map((segment) => segment.trim()).filter(Boolean)
  if (segments.some((segment) => segment === '.' || segment === '..' || /[\\\u0000-\u001F]/.test(segment))) {
    throw new Error('Obsidian 目录不能包含 .、..、反斜杠或控制字符。')
  }
  return segments.join('/')
}

export function sanitizeNoteFilename(title: string): string {
  const safe = title
    .normalize('NFKC')
    .replace(/[\\/:*?"<>|\u0000-\u001F]/g, ' ')
    .replace(/^\.+/, '')
    .replace(/\s+/g, ' ')
    .trim()
  return safe || '未命名笔记'
}

export async function syncToObsidian(
  title: string,
  markdown: string,
  obsidianDir: string,
  config: SyncConfig
): Promise<void> {
  const baseUrl = assertSecureSyncEndpoint(config.api)
  const url = `${baseUrl}/api/note`
  const cleanDir = normalizeObsidianDirectory(obsidianDir)
  const safeTitle = sanitizeNoteFilename(title)
  
  let currentTitle = safeTitle
  let attempts = 0
  const maxAttempts = 3

  while (attempts < maxAttempts) {
    attempts++
    const fullPath = cleanDir ? `${cleanDir}/${currentTitle}.md` : `${currentTitle}.md`

    const response = await fetchWithProxy(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'token': config.apiToken
      },
      body: JSON.stringify({
        vault: config.vault,
        path: fullPath,
        content: markdown,
        createOnly: true // 开启重名检查
      })
    })

    if (!response.ok) {
      throw new Error(`Obsidian 同步失败 (${response.status})`)
    }

    const data = await response.json().catch(() => null)
    if (data) {
      const isDuplicate = data.status === false && (data.code === 431 || String(data.message || '').includes('already exists'))
      if (isDuplicate && attempts < maxAttempts) {
        const now = new Date()
        const pad = (n: number) => String(n).padStart(2, '0')
        const suffix = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
        currentTitle = `${safeTitle}_${suffix}_${attempts}`
        continue
      }

      if (data.status === false) {
        throw new Error(`Obsidian 同步失败: ${data.msg || data.message || '未知错误'}`)
      }
    }
    
    // 成功同步，退出循环
    break
  }
}

export async function testSyncConnection(config: SyncConfig): Promise<void> {
  const baseUrl = assertSecureSyncEndpoint(config.api)
  const url = `${baseUrl}/api/user/info`
  
  const response = await fetchWithProxy(url, {
    method: 'GET',
    headers: {
      'token': config.apiToken
    }
  })

  if (!response.ok) {
    throw new Error(`连接失败 (${response.status})`)
  }

  const data = await response.json().catch(() => null)
  if (data && data.status === false) {
    throw new Error(`鉴权失败: ${data.msg || data.message || '无效 Token'}`)
  }
}
