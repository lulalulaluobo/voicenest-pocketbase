export interface SyncConfig {
  endpoint: string
}

export async function syncToObsidian(
  title: string,
  markdown: string,
  obsidianPath: string,
  config: SyncConfig
): Promise<void> {
  const url = config.endpoint.replace(/\/+$/, '')
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      title,
      content: markdown,
      path: obsidianPath
    })
  })

  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    throw new Error(`Fast Note Sync 同步失败 (${response.status}): ${errText}`)
  }
}
