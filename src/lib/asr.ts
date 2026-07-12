export interface ASRConfig {
  type: 'step' | 'openai' | 'custom'
  endpoint: string
  apiKey: string
  model: string
  timeoutMs?: number
}

export async function transcribeAudio(blob: Blob, config: ASRConfig): Promise<string> {
  const ext = blob.type.includes('mp4') ? 'mp4' : blob.type.includes('wav') ? 'wav' : 'webm'
  const file = new File([blob], `audio.${ext}`, { type: blob.type })
  const formData = new FormData()
  formData.append('file', file)
  formData.append('model', config.model)

  const url = `${config.endpoint.replace(/\/+$/, '')}/audio/transcriptions`
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs || 30000)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: formData,
      signal: controller.signal
    })
    clearTimeout(timeoutId)

    if (!response.ok) {
      throw new Error(`ASR API 调用失败 (${response.status})`)
    }

    const data = await response.json()
    return data.text || ''
  } catch (err: any) {
    clearTimeout(timeoutId)
    throw err
  }
}
