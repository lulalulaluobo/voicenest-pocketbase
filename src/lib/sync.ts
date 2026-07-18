export interface SyncConfig {
  api: string
  apiToken: string
  vault: string
}

export function isObsidianConfigured(config: SyncConfig): boolean {
  return Boolean(config.apiToken.trim() && config.vault.trim())
}

// Fast Note Sync 走前端直连用户自配的 Obsidian 同步服务。
// 如遇 CORS，由用户在 Fast Note Sync 服务端配置允许的前端 Origin。

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

    const response = await fetch(url, {
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
  
  const response = await fetch(url, {
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
