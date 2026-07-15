import { describe, expect, it, vi } from 'vitest'
import { createDraft, getAccessToken } from './wechat'
import type { Env, KVStore } from './types'

function createKv(initial: Record<string, string> = {}): KVStore {
  const values = new Map(Object.entries(initial))
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

const env: Env = {
  WECHAT_CACHE: createKv(),
  WECHAT_APP_ID: 'app-id',
  WECHAT_APP_SECRET: 'app-secret',
  WECHAT_COVER_MEDIA_ID: 'cover-media-id',
  ALLOWED_ORIGINS: 'https://obvoice.lucc.fun,https://localhost'
}

describe('WeChat API', () => {
  it('reuses a cached access token without a network request', async () => {
    const cachedEnv = { ...env, WECHAT_CACHE: createKv({
      'wechat:token': JSON.stringify({ token: 'cached-token', expiresAt: Date.now() + 3_600_000 })
    }) }
    const fetchFn = vi.fn()

    await expect(getAccessToken(cachedEnv, fetchFn)).resolves.toBe('cached-token')
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('creates a draft with the shared cover and closed comments', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'token', expires_in: 7200 }))
      .mockResolvedValueOnce(jsonResponse({ media_id: 'draft-1' }))

    const mediaId = await createDraft(env, {
      title: '今日感想',
      content: '<p>内容</p>',
      thumb_media_id: '',
      need_open_comment: 0,
      only_fans_can_comment: 0
    }, fetchFn)

    expect(mediaId).toBe('draft-1')
    expect(fetchFn.mock.calls[1][0]).toContain('/cgi-bin/draft/add?access_token=token')
    expect(JSON.parse(fetchFn.mock.calls[1][1].body).articles[0]).toMatchObject({
      thumb_media_id: 'cover-media-id',
      need_open_comment: 0,
      only_fans_can_comment: 0
    })
  })

})
