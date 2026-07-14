import { renderWechatHtml } from './markdown'
import type { DraftArticle, DraftRequest, DraftResponse, Env } from './types'
import { createDraft, getAccessToken, updateDraft, WechatApiError } from './wechat'

const REQUEST_TTL_SECONDS = 60 * 60 * 24 * 7

function json(data: unknown, status = 200, origin?: string): Response {
  const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8' })
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin)
    headers.set('Access-Control-Allow-Credentials', 'true')
    headers.set('Vary', 'Origin')
  }
  return new Response(JSON.stringify(data), { status, headers })
}

function isAllowedOrigin(request: Request, env: Env): boolean {
  return request.headers.get('Origin') === env.ALLOWED_ORIGIN
}

function validateDraft(input: unknown, env: Env): DraftRequest | Response {
  if (!input || typeof input !== 'object') {
    return json({ code: 'INVALID_REQUEST', message: '请求格式无效' }, 400, env.ALLOWED_ORIGIN)
  }

  const request = input as Partial<DraftRequest>
  if (!request.recordingId || !request.requestId || !request.title?.trim() || !request.markdown?.trim()) {
    return json({ code: 'INVALID_REQUEST', message: '录音、请求、标题和正文不能为空' }, 400, env.ALLOWED_ORIGIN)
  }
  if ([...request.title].length > 64) {
    return json({ code: 'INVALID_REQUEST', message: '公众号标题不能超过 64 个字符' }, 400, env.ALLOWED_ORIGIN)
  }

  return {
    recordingId: request.recordingId,
    requestId: request.requestId,
    title: request.title.trim(),
    markdown: request.markdown,
    draftMediaId: request.draftMediaId
  }
}

function makeArticle(request: DraftRequest, env: Env): DraftArticle | Response {
  const content = renderWechatHtml(request.markdown)
  if (content.length >= 20_000 || new TextEncoder().encode(content).byteLength >= 1_000_000) {
    return json({ code: 'INVALID_REQUEST', message: '整理后的文章过长，无法写入公众号草稿' }, 400, env.ALLOWED_ORIGIN)
  }

  return {
    title: request.title,
    content,
    thumb_media_id: env.WECHAT_COVER_MEDIA_ID,
    need_open_comment: 0,
    only_fans_can_comment: 0
  }
}

function isResponse(value: unknown): value is Response {
  return value instanceof Response
}

async function handleDraft(request: Request, env: Env): Promise<Response> {
  const input = validateDraft(await request.json().catch(() => null), env)
  if (isResponse(input)) return input

  const cached = await env.WECHAT_CACHE.get(`draft-request:${input.requestId}`)
  if (cached) {
    const value = JSON.parse(cached) as { mediaId?: string }
    if (value.mediaId) {
      const response: DraftResponse = { mediaId: value.mediaId, reused: true }
      return json(response, 200, env.ALLOWED_ORIGIN)
    }
  }

  const article = makeArticle(input, env)
  if (isResponse(article)) return article

  const mediaId = input.draftMediaId
    ? await updateDraft(env, input.draftMediaId, article)
    : await createDraft(env, article)
  await env.WECHAT_CACHE.put(`draft-request:${input.requestId}`, JSON.stringify({ mediaId }), {
    expirationTtl: REQUEST_TTL_SECONDS
  })

  const response: DraftResponse = { mediaId, reused: false }
  return json(response, 200, env.ALLOWED_ORIGIN)
}

function handleError(error: unknown, env: Env): Response {
  if (error instanceof WechatApiError && error.code === 40164) {
    return json({
      code: 'WECHAT_IP_NOT_ALLOWED',
      message: '公众号 IP 白名单未配置，请根据微信返回的出口 IP 更新白名单后重试'
    }, 422, env.ALLOWED_ORIGIN)
  }
  if (error instanceof WechatApiError) {
    return json({ code: 'WECHAT_API_ERROR', message: `微信公众号接口失败：${error.message}` }, 502, env.ALLOWED_ORIGIN)
  }
  return json({ code: 'INTERNAL_ERROR', message: '发布服务暂时不可用' }, 500, env.ALLOWED_ORIGIN)
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!isAllowedOrigin(request, env)) {
      return json({ code: 'FORBIDDEN', message: '不允许的来源' }, 403)
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN,
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          Vary: 'Origin'
        }
      })
    }

    try {
      const url = new URL(request.url)
      if (request.method === 'POST' && url.pathname === '/connection-test') {
        await getAccessToken(env)
        return json({ ok: true }, 200, env.ALLOWED_ORIGIN)
      }
      if (request.method === 'POST' && url.pathname === '/drafts') {
        return await handleDraft(request, env)
      }
      return json({ code: 'NOT_FOUND', message: '接口不存在' }, 404, env.ALLOWED_ORIGIN)
    } catch (error) {
      return handleError(error, env)
    }
  }
}
