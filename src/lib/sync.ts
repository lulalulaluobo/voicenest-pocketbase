import { pb } from './pocketbase'

export interface SyncConfig {
  api: string
  apiToken: string
  vault: string
}

export function isObsidianConfigured(config: SyncConfig): boolean {
  return Boolean(config.apiToken.trim() && config.vault.trim())
}

// 网页端通过同源 PocketBase 转发 FNS；Token 仅随单次请求传递，不保存到后端。

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
  const cleanDir = normalizeObsidianDirectory(obsidianDir)
  const safeTitle = sanitizeNoteFilename(title)
  
  let currentTitle = safeTitle
  let attempts = 0
  const maxAttempts = 3

  while (attempts < maxAttempts) {
    attempts++
    const fullPath = cleanDir ? `${cleanDir}/${currentTitle}.md` : `${currentTitle}.md`

    const response = await fetch(`${pb.baseUrl}/api/fns/note`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(pb.authStore.isValid && pb.authStore.token ? { Authorization: `Bearer ${pb.authStore.token}` } : {})
      },
      body: JSON.stringify({
        api: baseUrl,
        apiToken: config.apiToken,
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

  let response: Response
  try {
    response = await fetch(`${pb.baseUrl}/api/fns/connection-test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(pb.authStore.isValid && pb.authStore.token ? { Authorization: `Bearer ${pb.authStore.token}` } : {})
      },
      body: JSON.stringify({ api: baseUrl, apiToken: config.apiToken })
    })
  } catch {
    throw new Error('无法连接 VoiceNest 后端，请检查登录状态和网络。')
  }

  if (!response.ok) {
    throw new Error(`连接失败 (${response.status})`)
  }

  const data = await response.json().catch(() => null)
  if (data && data.status === false) {
    throw new Error(`鉴权失败: ${data.msg || data.message || '无效 Token'}`)
  }
}
