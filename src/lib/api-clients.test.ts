import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { transcribeAudio } from './asr'
import { formatNote } from './llm'
import { syncToObsidian } from './sync'

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

  it('should sync markdown file to Obsidian via Fast Note Sync', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      status: 200
    } as Response)

    await expect(
      syncToObsidian('测试文件', '# 内容', '/path/to/Obsidian', {
        endpoint: 'http://localhost:8080/sync'
      })
    ).resolves.not.toThrow()
  })
})
