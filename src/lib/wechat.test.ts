import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getWechatDraftConfig,
  getWechatPromptTemplates,
  saveWechatDraftConfig,
  saveWechatPromptTemplates,
} from './config-store'
import {
  getWechatStatusLabel,
  generateWechatCover,
  previewWechatDraft,
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
    const body = JSON.parse(vi.mocked(globalThis.fetch).mock.calls[0][1]?.body as string)
    expect(body.recordingId).toBe('recording-1')
  })

  it('keeps an existing draft ID when updating a draft', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      mediaId: 'draft-1',
      reused: false
    })))

    await publishWechatDraft(config, { ...request, draftMediaId: 'draft-existing' })

    const body = JSON.parse(vi.mocked(globalThis.fetch).mock.calls[0][1]?.body as string)
    expect(body.draftMediaId).toBe('draft-existing')
  })

  it('posts article markdown to the preview endpoint', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      title: '标题',
      html: '<p>正文</p>'
    })))

    await expect(previewWechatDraft(config, { title: '标题', markdown: '正文' })).resolves.toEqual({ title: '标题', html: '<p>正文</p>' })
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://wechat-api.lucc.fun/preview',
      expect.objectContaining({ method: 'POST', credentials: 'include' })
    )
  })

  it('posts article context and an optional reference image to the cover endpoint', async () => {
    const dataUrl = 'data:image/png;base64,iVBORw=='
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      mimeType: 'image/png',
      dataUrl
    })))

    await expect(generateWechatCover(config, {
      title: '标题', markdown: '正文', prompt: '极简横版封面', referenceImageDataUrl: dataUrl
    })).resolves.toEqual({ mimeType: 'image/png', dataUrl })
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://wechat-api.lucc.fun/cover/generate',
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

  it('uses three editable WeChat prompt templates', () => {
    expect(getWechatPromptTemplates().map((template) => template.id)).toEqual([
      'insight',
      'knowledge',
      'daily'
    ])

    const templates = getWechatPromptTemplates()
    saveWechatPromptTemplates([
      { ...templates[0], prompt: '改成个人观点文章' },
      ...templates.slice(1)
    ])

    expect(getWechatPromptTemplates()[0].prompt).toBe('改成个人观点文章')
  })

  it('formats draft status for the recording views', () => {
    expect(getWechatStatusLabel('drafted')).toBe('公众号草稿：已保存至草稿箱')
    expect(getWechatStatusLabel('authorization_required')).toBe('公众号草稿：需要重新授权')
  })
})
