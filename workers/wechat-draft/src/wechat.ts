import { parseImageDataUrl } from './images'
import type { DraftArticle, Env, WechatCoverImage } from './types'

const TOKEN_CACHE_KEY = 'wechat:token'
const TOKEN_SAFETY_MARGIN_MS = 300_000

interface TokenCache {
  token: string
  expiresAt: number
}

export class WechatApiError extends Error {
  constructor(public readonly code: number, message: string) {
    super(message)
    this.name = 'WechatApiError'
  }
}

async function readWechatJson(response: Response): Promise<Record<string, unknown>> {
  const data = await response.json().catch(() => ({})) as Record<string, unknown>
  const code = typeof data.errcode === 'number' ? data.errcode : response.ok ? 0 : response.status

  if (!response.ok || code !== 0) {
    const message = typeof data.errmsg === 'string' ? data.errmsg : `微信接口请求失败 (${response.status})`
    throw new WechatApiError(code, message)
  }

  return data
}

export async function getAccessToken(env: Env, fetchFn: typeof fetch = fetch): Promise<string> {
  const cached = await env.WECHAT_CACHE.get(TOKEN_CACHE_KEY)
  if (cached) {
    const value = JSON.parse(cached) as TokenCache
    if (value.token && value.expiresAt > Date.now() + TOKEN_SAFETY_MARGIN_MS) {
      return value.token
    }
  }

  const url = new URL('https://api.weixin.qq.com/cgi-bin/token')
  url.searchParams.set('grant_type', 'client_credential')
  url.searchParams.set('appid', env.WECHAT_APP_ID)
  url.searchParams.set('secret', env.WECHAT_APP_SECRET)

  const data = await readWechatJson(await fetchFn(url))
  const token = data.access_token
  if (typeof token !== 'string') {
    throw new WechatApiError(-1, '微信接口未返回 access_token')
  }

  const expiresIn = typeof data.expires_in === 'number' ? data.expires_in : 7200
  const expiresAt = Date.now() + expiresIn * 1000
  await env.WECHAT_CACHE.put(TOKEN_CACHE_KEY, JSON.stringify({ token, expiresAt }), {
    expirationTtl: expiresIn
  })
  return token
}

function withCover(env: Env, article: DraftArticle, coverMediaId?: string): DraftArticle {
  return {
    ...article,
    thumb_media_id: coverMediaId || env.WECHAT_COVER_MEDIA_ID,
    need_open_comment: 0,
    only_fans_can_comment: 0
  }
}

async function uploadPermanentCover(
  token: string,
  cover: WechatCoverImage,
  fetchFn: typeof fetch
): Promise<string> {
  const image = parseImageDataUrl(cover.dataUrl)
  const extension = image.mimeType === 'image/png' ? 'png' : image.mimeType === 'image/webp' ? 'webp' : 'jpg'
  const form = new FormData()
  form.set('media', new Blob([new Uint8Array(image.bytes)], { type: image.mimeType }), `voicenest-cover.${extension}`)
  const response = await fetchFn(`https://api.weixin.qq.com/cgi-bin/material/add_material?access_token=${encodeURIComponent(token)}&type=image`, {
    method: 'POST',
    body: form
  })
  const data = await readWechatJson(response)
  if (typeof data.media_id !== 'string') {
    throw new WechatApiError(-1, '微信接口未返回封面素材 ID')
  }
  return data.media_id
}

export async function createDraft(
  env: Env,
  article: DraftArticle,
  fetchFn: typeof fetch = fetch,
  cover?: WechatCoverImage
): Promise<string> {
  const token = await getAccessToken(env, fetchFn)
  const coverMediaId = cover ? await uploadPermanentCover(token, cover, fetchFn) : undefined
  const response = await fetchFn(`https://api.weixin.qq.com/cgi-bin/draft/add?access_token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ articles: [withCover(env, article, coverMediaId)] })
  })
  const data = await readWechatJson(response)

  if (typeof data.media_id !== 'string') {
    throw new WechatApiError(-1, '微信接口未返回草稿 ID')
  }
  return data.media_id
}

export async function updateDraft(
  env: Env,
  mediaId: string,
  article: DraftArticle,
  fetchFn: typeof fetch = fetch,
  cover?: WechatCoverImage
): Promise<string> {
  const token = await getAccessToken(env, fetchFn)
  const coverMediaId = cover ? await uploadPermanentCover(token, cover, fetchFn) : undefined
  const response = await fetchFn(`https://api.weixin.qq.com/cgi-bin/draft/update?access_token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      media_id: mediaId,
      index: 0,
      articles: withCover(env, article, coverMediaId)
    })
  })
  await readWechatJson(response)
  return mediaId
}
