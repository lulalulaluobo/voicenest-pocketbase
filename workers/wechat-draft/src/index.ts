import { renderWechatHtml } from './markdown'
import { parseImageDataUrl } from './images'
import type { DraftArticle, DraftRequest, DraftResponse, Env } from './types'
import { createDraft, getAccessToken, updateDraft, uploadCover, WechatApiError } from './wechat'

const REQUEST_TTL_SECONDS = 60 * 60 * 24 * 7
const DEFAULT_COVER_KEY = 'wechat:default-cover-media-id'

interface PreviewRequest {
  title: string
  markdown: string
}

function json(data: unknown, status = 200, origin?: string): Response {
  const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8' })
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin)
    headers.set('Access-Control-Allow-Credentials', 'true')
    headers.set('Vary', 'Origin')
  }
  return new Response(JSON.stringify(data), { status, headers })
}

function isAllowedOrigin(origin: string, env: Env): boolean {
  return env.ALLOWED_ORIGINS.split(',').map((value) => value.trim()).includes(origin)
}

function allowedOrigin(request: Request, env: Env): string | undefined {
  const origin = request.headers.get('Origin')
  return origin && isAllowedOrigin(origin, env) ? origin : undefined
}

function authorizationReturnUrl(url: URL, env: Env): string | undefined {
  const value = url.searchParams.get('return_to')
  if (!value) return undefined

  try {
    const target = new URL(value)
    if (
      target.protocol !== 'https:'
      || !isAllowedOrigin(target.origin, env)
      || target.pathname !== '/settings'
      || target.search !== '?wechat-authorized=1'
      || target.hash
      || target.username
      || target.password
    ) return undefined
    return target.toString()
  } catch {
    return undefined
  }
}

function validateDraft(input: unknown, origin: string): DraftRequest | Response {
  if (!input || typeof input !== 'object') {
    return json({ code: 'INVALID_REQUEST', message: '请求格式无效' }, 400, origin)
  }

  const request = input as Partial<DraftRequest>
  if (!request.recordingId || !request.requestId || !request.title?.trim() || !request.markdown?.trim()) {
    return json({ code: 'INVALID_REQUEST', message: '录音、请求、标题和正文不能为空' }, 400, origin)
  }
  if ([...request.title].length > 64) {
    return json({ code: 'INVALID_REQUEST', message: '公众号标题不能超过 64 个字符' }, 400, origin)
  }
  return {
    recordingId: request.recordingId,
    requestId: request.requestId,
    title: request.title.trim(),
    markdown: request.markdown,
    draftMediaId: request.draftMediaId
  }
}

function validatePreview(input: unknown, origin: string): PreviewRequest | Response {
  if (!input || typeof input !== 'object') {
    return json({ code: 'INVALID_REQUEST', message: '请求格式无效' }, 400, origin)
  }

  const request = input as Partial<PreviewRequest>
  if (!request.title?.trim() || !request.markdown?.trim()) {
    return json({ code: 'INVALID_REQUEST', message: '标题和正文不能为空' }, 400, origin)
  }
  if ([...request.title].length > 64) {
    return json({ code: 'INVALID_REQUEST', message: '公众号标题不能超过 64 个字符' }, 400, origin)
  }

  return { title: request.title.trim(), markdown: request.markdown }
}

function validateContent(content: string, origin: string): Response | undefined {
  if (content.length >= 20_000 || new TextEncoder().encode(content).byteLength >= 1_000_000) {
    return json({ code: 'INVALID_REQUEST', message: '整理后的文章过长，无法写入公众号草稿' }, 400, origin)
  }
}

async function makeArticle(request: DraftRequest, env: Env, origin: string): Promise<DraftArticle | Response> {
  const content = renderWechatHtml(request.markdown)
  const invalid = validateContent(content, origin)
  if (invalid) return invalid

  const coverMediaId = await env.WECHAT_CACHE.get(DEFAULT_COVER_KEY)
  if (!coverMediaId) {
    return json({ code: 'COVER_NOT_CONFIGURED', message: '请先在设置中上传公众号默认封面' }, 422, origin)
  }

  return {
    title: request.title,
    content,
    thumb_media_id: coverMediaId,
    need_open_comment: 0,
    only_fans_can_comment: 0
  }
}

function isResponse(value: unknown): value is Response {
  return value instanceof Response
}

function isInvalidDraftMedia(error: unknown): boolean {
  return error instanceof WechatApiError
    && (error.code === 40007 || error.message.includes('invalid media_id'))
}

async function handleDraft(request: Request, env: Env, origin: string): Promise<Response> {
  const input = validateDraft(await request.json().catch(() => null), origin)
  if (isResponse(input)) return input

  const cached = await env.WECHAT_CACHE.get(`draft-request:${input.requestId}`)
  if (cached) {
    const value = JSON.parse(cached) as { mediaId?: string }
    if (value.mediaId) {
      const response: DraftResponse = { mediaId: value.mediaId, reused: true }
      return json(response, 200, origin)
    }
  }

  const article = await makeArticle(input, env, origin)
  if (isResponse(article)) return article

  let mediaId: string
  if (input.draftMediaId) {
    try {
      mediaId = await updateDraft(env, input.draftMediaId, article)
    } catch (error) {
      if (!isInvalidDraftMedia(error)) throw error
      mediaId = await createDraft(env, article)
    }
  } else {
    mediaId = await createDraft(env, article)
  }
  await env.WECHAT_CACHE.put(`draft-request:${input.requestId}`, JSON.stringify({ mediaId }), {
    expirationTtl: REQUEST_TTL_SECONDS
  })

  const response: DraftResponse = { mediaId, reused: false }
  return json(response, 200, origin)
}

async function handleCoverStatus(env: Env, origin: string): Promise<Response> {
  return json({ configured: Boolean(await env.WECHAT_CACHE.get(DEFAULT_COVER_KEY)) }, 200, origin)
}

async function handleCover(request: Request, env: Env, origin: string): Promise<Response> {
  const input = await request.json().catch(() => null) as { dataUrl?: unknown } | null
  let image
  try {
    image = parseImageDataUrl(input?.dataUrl)
  } catch (error) {
    return json({
      code: 'INVALID_COVER',
      message: error instanceof Error ? error.message : '封面图片无效'
    }, 400, origin)
  }
  const mediaId = await uploadCover(env, image)
  await env.WECHAT_CACHE.put(DEFAULT_COVER_KEY, mediaId)
  return json({ configured: true }, 200, origin)
}

async function handlePreview(request: Request, origin: string): Promise<Response> {
  const input = validatePreview(await request.json().catch(() => null), origin)
  if (isResponse(input)) return input

  const html = renderWechatHtml(input.markdown)
  const invalid = validateContent(html, origin)
  if (invalid) return invalid

  return json({ title: input.title, html }, 200, origin)
}

function handleError(error: unknown, origin: string): Response {
  if (error instanceof WechatApiError && error.code === 40164) {
    return json({
      code: 'WECHAT_IP_NOT_ALLOWED',
      message: `公众号 IP 白名单未配置：${error.message}`
    }, 422, origin)
  }
  if (error instanceof WechatApiError) {
    return json({ code: 'WECHAT_API_ERROR', message: `微信公众号接口失败：${error.message}` }, 502, origin)
  }
  return json({ code: 'INTERNAL_ERROR', message: '发布服务暂时不可用' }, 500, origin)
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const isAuthorizationPage = request.method === 'GET' && url.pathname === '/'

    const origin = allowedOrigin(request, env)
    if (!origin && !isAuthorizationPage) {
      return json({ code: 'FORBIDDEN', message: '不允许的来源' }, 403)
    }

    if (isAuthorizationPage) {
      const returnUrl = authorizationReturnUrl(url, env)
      if (returnUrl) return Response.redirect(returnUrl, 302)
      return new Response('VoiceNest 公众号草稿服务已授权，可以返回应用继续操作。', {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      })
    }

    if (!origin) return json({ code: 'FORBIDDEN', message: '不允许的来源' }, 403)

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': origin!,
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          Vary: 'Origin'
        }
      })
    }

    try {
      if (request.method === 'POST' && url.pathname === '/connection-test') {
        await getAccessToken(env)
        return json({ ok: true }, 200, origin)
      }
      if (request.method === 'GET' && url.pathname === '/cover') {
        return await handleCoverStatus(env, origin)
      }
      if (request.method === 'POST' && url.pathname === '/cover') {
        return await handleCover(request, env, origin)
      }
      if (request.method === 'POST' && url.pathname === '/preview') {
        return await handlePreview(request, origin)
      }
      if (request.method === 'POST' && url.pathname === '/drafts') {
        return await handleDraft(request, env, origin)
      }
      return json({ code: 'NOT_FOUND', message: '接口不存在' }, 404, origin)
    } catch (error) {
      return handleError(error, origin)
    }
  }
}
