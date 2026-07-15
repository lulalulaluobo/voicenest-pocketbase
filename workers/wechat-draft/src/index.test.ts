import { afterEach, describe, expect, it, vi } from 'vitest'
import worker from './index'
import type { Env, KVStore } from './types'

function createKv(): KVStore {
  const values = new Map<string, string>()
  return {
    get: async (key) => values.get(key) ?? null,
    put: async (key, value) => {
      values.set(key, value)
    }
  }
}

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' }
  })
}

function createEnv(): Env {
  return {
    WECHAT_CACHE: createKv(),
    WECHAT_APP_ID: 'app-id',
    WECHAT_APP_SECRET: 'app-secret',
    WECHAT_COVER_MEDIA_ID: 'cover-media-id',
    ALLOWED_ORIGIN: 'https://obvoice.lucc.fun'
  }
}

function draftRequest(requestId = 'request-1'): Request {
  return new Request('https://wechat-api.lucc.fun/drafts', {
    method: 'POST',
    headers: {
      Origin: 'https://obvoice.lucc.fun',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      recordingId: 'recording-1',
      requestId,
      title: '今日感想',
      markdown: '# 今日感想\n\n正文'
    })
  })
}

function previewRequest(): Request {
  return new Request('https://wechat-api.lucc.fun/preview', {
    method: 'POST',
    headers: {
      Origin: 'https://obvoice.lucc.fun',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ title: '预览标题', markdown: '## 小节\n\n正文' })
  })
}

function coverRequest(referenceImageDataUrl?: string): Request {
  return new Request('https://wechat-api.lucc.fun/cover/generate', {
    method: 'POST',
    headers: {
      Origin: 'https://obvoice.lucc.fun',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      title: '预览标题',
      markdown: '## 小节\n\n正文',
      prompt: '克制的公众号横版封面',
      referenceImageDataUrl
    })
  })
}

afterEach(() => vi.unstubAllGlobals())

describe('Worker routes', () => {
  it('shows a success page after interactive Access authorization', async () => {
    const response = await worker.fetch(new Request('https://wechat-api.lucc.fun/'), createEnv())

    expect(response.status).toBe(200)
    await expect(response.text()).resolves.toContain('已授权')
  })

  it('returns the same draft for a repeated request id', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'token', expires_in: 7200 }))
      .mockResolvedValueOnce(jsonResponse({ media_id: 'draft-1' }))
    vi.stubGlobal('fetch', fetchMock)
    const env = createEnv()

    const first = await worker.fetch(draftRequest(), env)
    const second = await worker.fetch(draftRequest(), env)

    await expect(first.json()).resolves.toEqual({ mediaId: 'draft-1', reused: false })
    await expect(second.json()).resolves.toEqual({ mediaId: 'draft-1', reused: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('maps WeChat IP whitelist errors to a usable response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      errcode: 40164,
      errmsg: 'invalid ip 172.64.1.2 not in whitelist'
    })))

    const response = await worker.fetch(draftRequest(), createEnv())

    expect(response.status).toBe(422)
    await expect(response.json()).resolves.toMatchObject({
      code: 'WECHAT_IP_NOT_ALLOWED',
      message: '公众号 IP 白名单未配置：invalid ip 172.64.1.2 not in whitelist'
    })
  })

  it('renders preview without requesting WeChat or changing drafts', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const response = await worker.fetch(previewRequest(), createEnv())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      title: '预览标题',
      html: expect.stringContaining('<h2 style=')
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns a validated Agnes cover without calling WeChat', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: [{ url: 'https://agnes.test/cover.png' }] }))
      .mockResolvedValueOnce(new Response(new Uint8Array([137, 80, 78, 71]), {
        headers: { 'Content-Type': 'image/png' }
      }))
    vi.stubGlobal('fetch', fetchMock)

    const response = await worker.fetch(coverRequest(), { ...createEnv(), AGNES_API_KEY: 'test-key' })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      mimeType: 'image/png',
      dataUrl: expect.stringMatching(/^data:image\/png;base64,/)
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
