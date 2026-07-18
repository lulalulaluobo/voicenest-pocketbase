import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getWechatDraftConfig,
  getWechatPromptTemplates,
  saveWechatDraftConfig,
  saveWechatPromptTemplates,
} from './config-store'
import {
  getWechatStatusLabel,
  getWechatCoverStatus,
  previewWechatDraft,
  publishWechatDraft,
  testWechatConnection,
  uploadWechatCover,
  setupWechatCredentials,
} from './wechat'

const config = {
  enabled: true,
  appId: 'wx-test-appid',
  configured: true
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

  it('does not retain Worker authorization callback code', () => {
    expect(readFileSync('src/lib/wechat.ts', 'utf8')).not.toContain('workerBaseUrl')
    expect(readFileSync('src/pages/SettingsPage.tsx', 'utf8')).not.toContain('wechat-authorized')
  })

  it('keeps the recording WeChat button actionable before setup is complete', () => {
    const card = readFileSync('src/components/RecordingCard.tsx', 'utf8')

    expect(card).not.toContain('disabled={!canEditWechat}')
    expect(card).toContain("navigate(canEditWechat ? `/recordings/${recording.id}/wechat` : '/settings')")
  })

  it('keeps PocketBase hook constants inside the required helper module', () => {
    const hook = readFileSync('pb_hooks/wechat.pb.js', 'utf8')
    const helpers = readFileSync('pb_hooks/wechat_helpers.js', 'utf8')

    expect(hook).toContain('H.MAX_APP_ID_LENGTH')
    expect(hook).not.toContain('const MAX_APP_ID_LENGTH')
    expect(helpers).toContain('MAX_APP_ID_LENGTH: MAX_APP_ID_LENGTH')
    expect(helpers).toContain('TOKEN_SAFETY_MARGIN_MS')
  })

  it('posts markdown to the configured worker with same-site credentials', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      mediaId: 'draft-1',
      reused: false
    })))

    await expect(publishWechatDraft(config, request)).resolves.toEqual({ mediaId: 'draft-1', reused: false })
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8090/api/wechat/drafts',
      expect.objectContaining({ method: 'POST' })
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
      'http://127.0.0.1:8090/api/wechat/preview',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('reads the configured default-cover status', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(new Response(JSON.stringify({ configured: true })))

    await expect(getWechatCoverStatus(config)).resolves.toEqual({ configured: true })
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8090/api/wechat/cover',
      expect.objectContaining({ method: 'GET' })
    )
  })

  it('uploads a selected image only when requested', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(new Response(JSON.stringify({ configured: true })))
    const image = {
      type: 'image/png',
      arrayBuffer: async () => new Uint8Array([0]).buffer
    } as File

    await expect(uploadWechatCover(config, image)).resolves.toEqual({ configured: true })
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8090/api/wechat/cover',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('turns an expired Access session into an authorization error', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(new Response('', { status: 401 }))

    await expect(testWechatConnection(config)).rejects.toThrow('公众号配置或授权已过期')
  })

  it('turns a missing Worker cover into an actionable error', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      code: 'COVER_NOT_CONFIGURED',
      message: 'ignored'
    }), { status: 422 }))

    await expect(publishWechatDraft(config, request)).rejects.toThrow('请先在设置中上传公众号默认封面')
  })

  it('rejects an invalid cover-status response', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(new Response(JSON.stringify({ configured: 'yes' })))

    await expect(getWechatCoverStatus(config)).rejects.toThrow('公众号封面服务返回的数据无效')
  })

  it('sends credentials to backend securely', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      success: true,
      configured: true
    })))

    await expect(setupWechatCredentials('wx-app-id', 'wx-secret')).resolves.toEqual({ success: true, configured: true })
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8090/api/wechat/setup-credential',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ appId: 'wx-app-id', appSecret: 'wx-secret' })
      })
    )
  })

  it('persists WeChat configuration locally', () => {
    saveWechatDraftConfig(config)

    expect(getWechatDraftConfig()).toEqual(config)
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
