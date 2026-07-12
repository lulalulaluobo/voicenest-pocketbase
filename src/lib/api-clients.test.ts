import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { transcribeAudio } from './asr'
import { formatNote } from './llm'
import { assertSecureSyncEndpoint, normalizeObsidianDirectory, sanitizeNoteFilename, syncToObsidian } from './sync'

describe('API Clients Unit Tests', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    globalThis.fetch = vi.fn()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
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

  it('should sync markdown file to Obsidian via Fast Note Sync', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: true }),
      status: 200
    } as Response)

    await expect(
      syncToObsidian('测试文件', '# 内容', 'Inbox/Ideas', {
        api: 'https://fns.example.test',
        apiToken: 'token-xyz',
        vault: 'my-vault'
      })
    ).resolves.not.toThrow()
  })

  it('should auto append suffix and retry when note already exists', async () => {
    // 第一次模拟返回 Note already exists (code 431)
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: false, code: 431, message: 'Note already exists' }),
      status: 200
    } as Response)

    // 第二次重试成功
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: true, code: 1 }),
      status: 200
    } as Response)

    await expect(
      syncToObsidian('重名文件', '# 内容', 'Inbox/Ideas', {
        api: 'https://fns.example.test',
        apiToken: 'token-xyz',
        vault: 'my-vault'
      })
    ).resolves.not.toThrow()

    expect(globalThis.fetch).toHaveBeenCalledTimes(2)
  })

  it('rejects non-HTTPS Fast Note Sync endpoints', () => {
    expect(() => assertSecureSyncEndpoint('http://localhost:8080')).toThrow('HTTPS')
  })

  it('rejects path traversal and strips unsafe filename characters', () => {
    expect(() => normalizeObsidianDirectory('../Inbox')).toThrow('..')
    expect(sanitizeNoteFilename('../会议:总结?')).toBe('会议 总结')
  })
})
