export interface ASRConfig {
  type: 'step' | 'openai' | 'custom'
  endpoint: string
  apiKey: string
  model: string
  timeoutMs?: number
}

export async function testASRConnection(config: ASRConfig): Promise<void> {
  const response = await fetch(`${config.endpoint.replace(/\/+$/, '')}/models`, {
    headers: { Authorization: `Bearer ${config.apiKey}` },
  })
  if (!response.ok) throw new Error(`ASR API 调用失败 (${response.status})`)
}

export async function transcribeAudio(blob: Blob, config: ASRConfig): Promise<string> {
  if (config.type === 'step' && !/(ogg|mpeg|mp3|wav|pcm)/.test(blob.type)) {
    throw new Error('StepAudio 当前仅支持 Ogg、MP3、WAV 或 PCM 录音，请重新录制后再转写。')
  }

  const ext = blob.type.includes('ogg')
    ? 'ogg'
    : blob.type.includes('mp4')
      ? 'mp4'
      : blob.type.includes('wav')
        ? 'wav'
        : blob.type.includes('mpeg') || blob.type.includes('mp3')
          ? 'mp3'
          : 'webm'
  const file = new File([blob], `audio.${ext}`, { type: blob.type })
  const formData = new FormData()
  formData.append('file', file)
  formData.append('model', config.model)
  if (config.type === 'step') formData.append('response_format', 'json')

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
      const body = config.type === 'step' ? await response.json().catch(() => null) : null
      const code = body?.error?.code ?? body?.code
      const safeCode = code === 'no_speech_found' || code === 'request_params_invalid' ? `: ${code}` : ''
      throw new Error(`ASR API 调用失败 (${response.status})${safeCode}`)
    }

    const data = await response.json()
    return data.text || ''
  } catch (err: any) {
    clearTimeout(timeoutId)
    throw err
  }
}
