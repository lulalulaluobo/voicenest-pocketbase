import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { transcribeAudio } from './asr'
import { formatNote, rewriteWechatArticle } from './llm'
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

  it('should sync markdown file to Obsidian via Fast Note Sync', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: true }),
      status: 200
    } as Response)

    await expect(
      syncToObsidian('测试文件', '# 内容', 'Inbox/Ideas', {
        api: 'http://localhost:8080',
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
        api: 'http://localhost:8080',
        apiToken: 'token-xyz',
        vault: 'my-vault'
      })
    ).resolves.not.toThrow()

    expect(globalThis.fetch).toHaveBeenCalledTimes(2)
  })
})
