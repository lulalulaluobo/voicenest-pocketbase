import { describe, expect, it, vi } from 'vitest'
import { generateAgnesCover } from './agnes'
import type { Env, KVStore } from './types'

function createKv(): KVStore {
  return { get: async () => null, put: async () => undefined }
}

const env: Env = {
  WECHAT_CACHE: createKv(),
  WECHAT_APP_ID: 'app-id',
  WECHAT_APP_SECRET: 'app-secret',
  WECHAT_COVER_MEDIA_ID: 'cover-media-id',
  ALLOWED_ORIGIN: 'https://obvoice.lucc.fun',
  AGNES_API_KEY: 'test-key'
}

const input = {
  title: '睡眠与学习',
  markdown: '今天我意识到规律作息的重要性。',
  prompt: '温暖克制的横版封面'
}

const pngBytes = new Uint8Array([137, 80, 78, 71])
const pngDataUrl = 'data:image/png;base64,iVBORw=='

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })
}

describe('Agnes cover API', () => {
  it('asks for one landscape cover and returns a downloaded PNG as a data URL', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: [{ url: 'https://agnes.test/cover.png' }] }))
      .mockResolvedValueOnce(new Response(pngBytes, { headers: { 'Content-Type': 'image/png' } }))

    await expect(generateAgnesCover(env, input, fetchFn)).resolves.toEqual({
      mimeType: 'image/png',
      dataUrl: pngDataUrl
    })
    expect(JSON.parse(fetchFn.mock.calls[0][1].body)).toMatchObject({
      model: 'agnes-image-2.0-flash',
      size: '1200x510',
      n: 1
    })
    const request = JSON.parse(fetchFn.mock.calls[0][1].body)
    expect(request.prompt).toContain('文章仅用于理解核心主题，绝不复刻标题、正文或任何文字')
    expect(request.prompt).toContain('参考图仅用于借鉴配色、光影、质感与氛围，禁止复制其文字、版式、主体、标志或水印')
  })

  it('passes a local data URL only through the reference-image probe field', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: [{ url: 'https://agnes.test/cover.png' }] }))
      .mockResolvedValueOnce(new Response(pngBytes, { headers: { 'Content-Type': 'image/png' } }))

    await generateAgnesCover(env, { ...input, referenceImageDataUrl: pngDataUrl }, fetchFn)

    expect(JSON.parse(fetchFn.mock.calls[0][1].body)).toMatchObject({
      tags: ['img2img'],
      extra_body: { image: [pngDataUrl], response_format: 'url' }
    })
  })

  it('rejects a non-image Agnes download', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: [{ url: 'https://agnes.test/cover.html' }] }))
      .mockResolvedValueOnce(new Response('<html>', { headers: { 'Content-Type': 'text/html' } }))

    await expect(generateAgnesCover(env, input, fetchFn)).rejects.toMatchObject({
      code: 'AGNES_IMAGE_INVALID'
    })
  })
})
