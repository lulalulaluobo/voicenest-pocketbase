import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { testASRConnection, transcribeAudio } from './asr'
import { formatNote, rewriteWechatArticle } from './llm'

describe('API Clients Unit Tests', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    globalThis.fetch = vi.fn()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('should send form data correctly in transcribeAudio', async () => {
    const mockBlob = new Blob(['wav-content'], { type: 'audio/webm' })
    const mockResponse = { text: '转写成功内容' }
    
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse
    } as Response)

    const text = await transcribeAudio(mockBlob, {
      type: 'openai',
      endpoint: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
      model: 'whisper-1'
    })

    expect(text).toBe('转写成功内容')
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
  })

  it('waits 15 minutes before aborting ASR when no timeout is configured', async () => {
    vi.useFakeTimers()
    let signal: AbortSignal | undefined
    globalThis.fetch = vi.fn((_url, request) => new Promise<Response>((_, reject) => {
      signal = (request as RequestInit).signal as AbortSignal
      signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    }))

    const pending = transcribeAudio(new Blob(['audio']), {
      type: 'openai', endpoint: 'https://api.openai.com/v1', apiKey: 'sk-test', model: 'whisper-1',
    })
    const rejected = pending.then(() => null, (error) => error)

    await vi.advanceTimersByTimeAsync(899_999)
    expect(signal?.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(await rejected).toMatchObject({ message: 'aborted' })
  })

  it('checks StepAudio credentials through the model list endpoint', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ object: 'list', data: [] }),
    } as Response)

    await expect(testASRConnection({
      type: 'step',
      endpoint: 'https://api.stepfun.com/v1',
      apiKey: 'step-test',
      model: 'stepaudio-2.5-asr',
    })).resolves.toBeUndefined()

    expect(globalThis.fetch).toHaveBeenCalledWith('https://api.stepfun.com/v1/models', {
      headers: { Authorization: 'Bearer step-test' },
    })
  })

  it('uses StepAudio multipart requirements for Ogg recordings', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: '转写成功内容' }),
    } as Response)

    await transcribeAudio(new Blob(['audio'], { type: 'audio/ogg;codecs=opus' }), {
      type: 'step',
      endpoint: 'https://api.stepfun.com/v1',
      apiKey: 'step-test',
      model: 'stepaudio-2.5-asr',
    })

    const [, request] = vi.mocked(globalThis.fetch).mock.calls[0]
    const formData = request?.body as FormData
    expect(formData.get('response_format')).toBe('json')
    expect((formData.get('file') as File).name).toBe('audio.ogg')
  })

  it('converts WebM recordings to WAV before sending them to StepAudio', async () => {
    class FakeAudioContext {
      async decodeAudioData() {
        return {
          numberOfChannels: 1,
          length: 2,
          sampleRate: 16_000,
          getChannelData: () => new Float32Array([0, 0.5]),
        } as unknown as AudioBuffer
      }

      async close() {}
    }

    vi.stubGlobal('AudioContext', FakeAudioContext)
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: '转写成功内容' }),
    } as Response)

    await expect(transcribeAudio(new Blob(['audio'], { type: 'audio/webm' }), {
      type: 'step',
      endpoint: 'https://api.stepfun.com/v1',
      apiKey: 'step-test',
      model: 'stepaudio-2.5-asr',
    })).resolves.toBe('转写成功内容')

    const [, request] = vi.mocked(globalThis.fetch).mock.calls[0]
    const file = (request?.body as FormData).get('file') as File
    expect(file.name).toBe('audio.wav')
    expect(file.type).toBe('audio/wav')
  })

  it('keeps the safe StepAudio no-speech error code for connection testing', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: { code: 'no_speech_found' } }),
    } as Response)

    await expect(transcribeAudio(new Blob(['audio'], { type: 'audio/wav' }), {
      type: 'step',
      endpoint: 'https://api.stepfun.com/v1',
      apiKey: 'step-test',
      model: 'stepaudio-2.5-asr',
    })).rejects.toThrow('ASR API 调用失败 (400): no_speech_found')
  })

  it('should format note via LLM chat completions and parse JSON', async () => {
    const mockResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              title: '整理后标题',
              markdown: '# 整理后标题\n这是正文内容'
            })
          }
        }
      ]
    }

    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse
    } as Response)

    const res = await formatNote('原始转写内容', {
      name: '随想',
      prompt: '整理它',
      template: '{{content}}'
    }, {
      endpoint: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
      model: 'gpt-4o'
    })

    expect(res.title).toBe('整理后标题')
    expect(res.markdown).toContain('这是正文内容')
  })

  it('should rewrite a personal note into a WeChat article without changing the source', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ title: '改写后标题', markdown: '# 改写后标题\n\n公众号正文' }) } }]
      })
    } as Response)

    const source = '# 个人笔记\n\n今天的感想'
    const result = await rewriteWechatArticle(source, '改写成观点随笔', {
      endpoint: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
      model: 'gpt-4o'
    })

    expect(result).toEqual({ title: '改写后标题', markdown: '# 改写后标题\n\n公众号正文' })
    const body = JSON.parse(vi.mocked(globalThis.fetch).mock.calls[0][1]?.body as string)
    expect(body.messages[1].content).toContain(source)
    expect(body.messages[1].content).toContain('改写成观点随笔')
    expect(body.messages[0].content).toContain('每个列表项都必须有文字内容')
    expect(body.messages[0].content).toContain('禁止输出空的列表标记')
  })

  it('does not expose provider response bodies in API errors', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => 'invalid key sk-secret-value',
    } as Response)

    await expect(transcribeAudio(new Blob(['audio']), {
      type: 'openai', endpoint: 'https://api.openai.com/v1', apiKey: 'sk-test', model: 'whisper-1',
    })).rejects.toThrow('ASR API 调用失败 (401)')
  })

})
