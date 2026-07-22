export interface ASRConfig {
  type: 'step' | 'openai' | 'custom'
  endpoint: string
  apiKey: string
  model: string
  timeoutMs?: number
}

const defaultASRTimeoutMs = 15 * 60 * 1000

export async function testASRConnection(config: ASRConfig): Promise<void> {
  const response = await fetch(`${config.endpoint.replace(/\/+$/, '')}/models`, {
    headers: { Authorization: `Bearer ${config.apiKey}` },
  })
  if (!response.ok) throw new Error(`ASR API 调用失败 (${response.status})`)
}

function encodeWav(audio: AudioBuffer): Blob {
  const channels = audio.numberOfChannels
  const dataSize = audio.length * channels * 2
  const view = new DataView(new ArrayBuffer(44 + dataSize))
  const write = (offset: number, value: string) => [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)))
  write(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  write(8, 'WAVEfmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channels, true)
  view.setUint32(24, audio.sampleRate, true)
  view.setUint32(28, audio.sampleRate * channels * 2, true)
  view.setUint16(32, channels * 2, true)
  view.setUint16(34, 16, true)
  write(36, 'data')
  view.setUint32(40, dataSize, true)

  for (let frame = 0, offset = 44; frame < audio.length; frame++) {
    for (let channel = 0; channel < channels; channel++, offset += 2) {
      const sample = Math.max(-1, Math.min(1, audio.getChannelData(channel)[frame]))
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
    }
  }
  return new Blob([view], { type: 'audio/wav' })
}

async function prepareStepAudio(blob: Blob): Promise<Blob> {
  if (/(ogg|mpeg|mp3|wav|pcm)/.test(blob.type)) return blob

  const Context = globalThis.AudioContext ?? (globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Context) throw new Error('当前浏览器无法将录音转换为 StepAudio 支持的 WAV 格式。')
  const context = new Context()
  try {
    return encodeWav(await context.decodeAudioData(await blob.arrayBuffer()))
  } catch {
    throw new Error('无法转换这段录音，请使用支持 Ogg 录音的浏览器后重试。')
  } finally {
    await context.close()
  }
}

export async function transcribeAudio(blob: Blob, config: ASRConfig): Promise<string> {
  const audio = config.type === 'step' ? await prepareStepAudio(blob) : blob
  const ext = audio.type.includes('ogg')
    ? 'ogg'
    : audio.type.includes('mp4')
      ? 'mp4'
      : audio.type.includes('wav')
        ? 'wav'
        : audio.type.includes('mpeg') || audio.type.includes('mp3')
          ? 'mp3'
          : 'webm'
  const file = new File([audio], `audio.${ext}`, { type: audio.type })
  const formData = new FormData()
  formData.append('file', file)
  formData.append('model', config.model)
  if (config.type === 'step') formData.append('response_format', 'json')

  const url = `${config.endpoint.replace(/\/+$/, '')}/audio/transcriptions`
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs || defaultASRTimeoutMs)

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
