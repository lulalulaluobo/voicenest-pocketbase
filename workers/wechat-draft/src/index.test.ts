import { afterEach, describe, expect, it, vi } from 'vitest'
import worker from './index'
import type { Env, KVStore } from './types'

function createKv(initial: Record<string, string> = {}): KVStore {
  const values = new Map<string, string>(Object.entries(initial))
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

function createEnv(withCover = true): Env {
  return {
    WECHAT_CACHE: createKv(withCover ? { 'wechat:default-cover-media-id': 'cover-media-id' } : {}),
    WECHAT_APP_ID: 'app-id',
    WECHAT_APP_SECRET: 'app-secret',
    ALLOWED_ORIGINS: 'https://obvoice.lucc.fun,https://localhost'
  }
}

function draftRequest(requestId = 'request-1', draftMediaId?: string, origin = 'https://obvoice.lucc.fun'): Request {
  return new Request('https://wechat-api.lucc.fun/drafts', {
    method: 'POST',
    headers: {
      Origin: origin,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      recordingId: 'recording-1',
      requestId,
      title: '今日感想',
      markdown: '# 今日感想\n\n正文',
      ...(draftMediaId ? { draftMediaId } : {})
    })
  })
}

function previewRequest(origin = 'https://obvoice.lucc.fun'): Request {
  return new Request('https://wechat-api.lucc.fun/preview', {
    method: 'POST',
    headers: {
      Origin: origin,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ title: '预览标题', markdown: '## 小节\n\n正文' })
  })
}

afterEach(() => vi.unstubAllGlobals())

describe('Worker routes', () => {
  it('allows Android WebView preflight requests', async () => {
    const response = await worker.fetch(new Request('https://wechat-api.lucc.fun/preview', {
      method: 'OPTIONS',
      headers: { Origin: 'https://localhost' }
    }), createEnv())

    expect(response.status).toBe(204)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://localhost')
    expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, OPTIONS')
  })

  it('rejects origins outside the allowlist', async () => {
    const response = await worker.fetch(previewRequest('https://untrusted.example'), createEnv())

    expect(response.status).toBe(403)
  })

  it('only returns to an allowed app settings page after interactive Access authorization', async () => {
    const response = await worker.fetch(new Request(
      'https://wechat-api.lucc.fun/?return_to=https%3A%2F%2Flocalhost%2Fsettings%3Fwechat-authorized%3D1'
    ), createEnv())

    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toBe('https://localhost/settings?wechat-authorized=1')

    const rejected = await worker.fetch(new Request(
      'https://wechat-api.lucc.fun/?return_to=https%3A%2F%2Funsafe.example%2Fsettings%3Fwechat-authorized%3D1'
    ), createEnv())
    expect(rejected.status).toBe(200)
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

  it('creates a new draft when the saved draft ID is no longer valid', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'token', expires_in: 7200 }))
      .mockResolvedValueOnce(jsonResponse({ errcode: 40007, errmsg: 'invalid media_id hint: [stale]' }))
      .mockResolvedValueOnce(jsonResponse({ media_id: 'draft-new' }))
    vi.stubGlobal('fetch', fetchMock)

    const response = await worker.fetch(draftRequest('request-stale', 'draft-stale'), createEnv())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ mediaId: 'draft-new', reused: false })
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('/cgi-bin/draft/update?')
    expect(String(fetchMock.mock.calls[2]?.[0])).toContain('/cgi-bin/draft/add?')
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

  it('reports whether a default cover is configured without exposing its media ID', async () => {
    const response = await worker.fetch(new Request('https://wechat-api.lucc.fun/cover', {
      headers: { Origin: 'https://obvoice.lucc.fun' }
    }), createEnv())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ configured: true })
  })

  it('uploads and saves a default cover as permanent WeChat material', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'token', expires_in: 7200 }))
      .mockResolvedValueOnce(jsonResponse({ media_id: 'cover-new' }))
    vi.stubGlobal('fetch', fetchMock)
    const env = createEnv(false)

    const response = await worker.fetch(new Request('https://wechat-api.lucc.fun/cover', {
      method: 'POST',
      headers: { Origin: 'https://obvoice.lucc.fun', 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataUrl: 'data:image/png;base64,AA==' })
    }), env)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ configured: true })
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('/cgi-bin/material/add_material?access_token=token&type=image')
    await expect(env.WECHAT_CACHE.get('wechat:default-cover-media-id')).resolves.toBe('cover-new')
  })

  it('rejects an unsupported cover before calling WeChat', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const response = await worker.fetch(new Request('https://wechat-api.lucc.fun/cover', {
      method: 'POST',
      headers: { Origin: 'https://obvoice.lucc.fun', 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataUrl: 'data:image/gif;base64,AA==' })
    }), createEnv(false))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ code: 'INVALID_COVER' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not create a draft before a default cover is configured', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const response = await worker.fetch(draftRequest(), createEnv(false))

    expect(response.status).toBe(422)
    await expect(response.json()).resolves.toEqual({
      code: 'COVER_NOT_CONFIGURED',
      message: '请先在设置中上传公众号默认封面'
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

})
