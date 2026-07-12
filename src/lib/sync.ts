export interface SyncConfig {
  api: string
  apiToken: string
  vault: string
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
  
  const response = await fetch(url, {
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
