import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getWechatDraftConfig,
  saveWechatDraftConfig,
} from './config-store'
import {
  getWechatStatusLabel,
  publishWechatDraft,
  testWechatConnection,
} from './wechat'

const config = {
  enabled: true,
  workerUrl: 'https://wechat-api.lucc.fun'
}

const request = {
  recordingId: 'recording-1',
  requestId: 'request-1',
  title: '今日感想',
  markdown: '# 今日感想\n\n正文'
}

describe('WeChat draft client', () => {
  const originalFetch = globalThis.fetch
  const values = new Map<string, string>()

  beforeEach(() => {
    values.clear()
    globalThis.fetch = vi.fn()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value)
    })
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('posts markdown to the configured worker with same-site credentials', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      mediaId: 'draft-1',
      reused: false
    })))

    await expect(publishWechatDraft(config, request)).resolves.toEqual({ mediaId: 'draft-1', reused: false })
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://wechat-api.lucc.fun/drafts',
      expect.objectContaining({ method: 'POST', credentials: 'include' })
    )
  })

  it('turns an expired Access session into an authorization error', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(new Response('', { status: 401 }))

    await expect(testWechatConnection(config)).rejects.toThrow('公众号发布授权已过期')
  })

  it('persists only the public Worker configuration', () => {
    saveWechatDraftConfig(config)

    expect(getWechatDraftConfig()).toEqual(config)
    expect(values.get('vn_wechat_draft')).not.toContain('AppSecret')
  })

  it('formats draft status for the recording views', () => {
    expect(getWechatStatusLabel('drafted')).toBe('公众号草稿：已保存至草稿箱')
    expect(getWechatStatusLabel('authorization_required')).toBe('公众号草稿：需要重新授权')
  })
})
