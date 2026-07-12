export interface SyncConfig {
  api: string
  apiToken: string
  vault: string
}

async function fetchWithProxy(url: string, options: RequestInit): Promise<Response> {
  try {
    return await fetch(url, options)
  } catch (err: any) {
    // 捕获跨域/网络故障产生的 Failed to fetch 错误
    const isPublic = /^https?:\/\//i.test(url) && !url.includes('localhost') && !url.includes('127.0.0.1')
    if (isPublic) {
      console.warn('直连失败或遇到 CORS 跨域拦截，尝试降级通过 Vercel 代理转发:', url)
      
      // 本地开发环境下，自动路由到线上 Vercel 实例代理，省去本地 Serverless 函数配置
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      const proxyBase = isLocalhost ? 'https://codex-stage1-recording.vercel.app' : ''
      const proxyUrl = `${proxyBase}/api/proxy?url=${encodeURIComponent(url)}`
      
      return await fetch(proxyUrl, options)
    }
    throw err
  }
}

export async function syncToObsidian(
  title: string,
  markdown: string,
  obsidianDir: string,
  config: SyncConfig
): Promise<void> {
  const baseUrl = config.api.replace(/\/+$/, '')
  const url = `${baseUrl}/api/note`
  
  // 拼接完整 Obsidian 文件相对路径，加 .md 后缀
  const cleanDir = obsidianDir.replace(/^\/+|\/+$/g, '')
  const fullPath = cleanDir ? `${cleanDir}/${title}.md` : `${title}.md`

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
      createOnly: false
    })
  })

  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    throw new Error(`Obsidian 同步失败 (${response.status}): ${errText}`)
  }

  const data = await response.json().catch(() => null)
  if (data && data.status === false) {
    throw new Error(`Obsidian 同步失败: ${data.msg || data.message || '未知错误'}`)
  }
}

export async function testSyncConnection(config: SyncConfig): Promise<void> {
  const baseUrl = config.api.replace(/\/+$/, '')
  const url = `${baseUrl}/api/user/info`
  
  const response = await fetchWithProxy(url, {
    method: 'GET',
    headers: {
      'token': config.apiToken
    }
  })

  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    throw new Error(`连接失败 (${response.status}): ${errText}`)
  }

  const data = await response.json().catch(() => null)
  if (data && data.status === false) {
    throw new Error(`鉴权失败: ${data.msg || data.message || '无效 Token'}`)
  }
}
