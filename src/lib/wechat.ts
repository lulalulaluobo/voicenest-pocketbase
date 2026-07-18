import type { WechatDraftConfig } from './config-store'
import type { WechatDraftStatus } from '../domain/recording'
import { pb } from './pocketbase'

export interface WechatDraftRequest {
  recordingId: string
  requestId: string
  title: string
  markdown: string
  draftMediaId?: string
}

export interface WechatDraftResult {
  mediaId: string
  reused: boolean
}

export interface WechatPreviewResult {
  title: string
  html: string
}

export interface WechatCoverStatus {
  configured: boolean
}

export class WechatDraftError extends Error {
  constructor(
    message: string,
    public readonly kind: 'authorization' | 'ip_whitelist' | 'cover_missing' | 'api'
  ) {
    super(message)
    this.name = 'WechatDraftError'
  }
}

export function getWechatStatusLabel(status?: WechatDraftStatus): string | undefined {
  const labels: Record<WechatDraftStatus, string> = {
    idle: '公众号草稿：未同步',
    syncing: '公众号草稿：同步中',
    drafted: '公众号草稿：已保存至草稿箱',
    failed: '公众号草稿：同步失败',
    authorization_required: '公众号草稿：需要重新授权'
  }
  return status ? labels[status] : undefined
}

function wechatApiBaseUrl(): string {
  return `${pb.baseUrl}/api/wechat`
}

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {}
  if (pb.authStore.isValid && pb.authStore.token) {
    headers['Authorization'] = `Bearer ${pb.authStore.token}`
  }
  return headers
}

async function readError(response: Response): Promise<WechatDraftError> {
  if (response.status === 401 || response.status === 403) {
    return new WechatDraftError('公众号配置或授权已过期，请检查设置。', 'authorization')
  }

  const data = await response.json().catch(() => null) as { code?: string; message?: string } | null
  if (data?.code === 'WECHAT_IP_NOT_ALLOWED') {
    return new WechatDraftError('公众号 IP 白名单未配置。', 'ip_whitelist')
  }
  if (data?.code === 'COVER_NOT_CONFIGURED') {
    return new WechatDraftError('请先在设置中上传公众号默认封面。', 'cover_missing')
  }
  return new WechatDraftError(data?.message || `公众号中转服务请求失败 (${response.status})`, 'api')
}

async function readCoverStatus(response: Response): Promise<WechatCoverStatus> {
  const data = await response.json().catch(() => null) as Partial<WechatCoverStatus> | null
  if (typeof data?.configured !== 'boolean') {
    throw new WechatDraftError('公众号封面服务返回的数据无效', 'api')
  }
  return { configured: data.configured }
}

async function imageDataUrl(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `data:${file.type};base64,${btoa(binary)}`
}

export async function testWechatConnection(config: WechatDraftConfig): Promise<void> {
  const response = await fetch(`${wechatApiBaseUrl()}/connection-test`, {
    method: 'POST',
    headers: {
      ...getAuthHeaders()
    }
  })
  if (!response.ok) {
    throw await readError(response)
  }
}

export async function getWechatCoverStatus(config: WechatDraftConfig): Promise<WechatCoverStatus> {
  const response = await fetch(`${wechatApiBaseUrl()}/cover`, {
    method: 'GET',
    headers: {
      ...getAuthHeaders()
    }
  })
  if (!response.ok) throw await readError(response)
  return readCoverStatus(response)
}

export async function uploadWechatCover(
  config: WechatDraftConfig,
  file: File
): Promise<WechatCoverStatus> {
  const response = await fetch(`${wechatApiBaseUrl()}/cover`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify({ dataUrl: await imageDataUrl(file) })
  })
  if (!response.ok) throw await readError(response)
  return readCoverStatus(response)
}

export async function previewWechatDraft(
  config: WechatDraftConfig,
  article: Pick<WechatDraftRequest, 'title' | 'markdown'>
): Promise<WechatPreviewResult> {
  const response = await fetch(`${wechatApiBaseUrl()}/preview`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify(article)
  })
  if (!response.ok) {
    throw await readError(response)
  }

  const data = await response.json() as Partial<WechatPreviewResult>
  if (typeof data.title !== 'string' || typeof data.html !== 'string') {
    throw new WechatDraftError('公众号预览服务返回的数据无效', 'api')
  }
  return { title: data.title, html: data.html }
}

export async function publishWechatDraft(
  config: WechatDraftConfig,
  request: WechatDraftRequest
): Promise<WechatDraftResult> {
  const response = await fetch(`${wechatApiBaseUrl()}/drafts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify(request)
  })
  if (!response.ok) {
    throw await readError(response)
  }

  const data = await response.json() as Partial<WechatDraftResult>
  if (typeof data.mediaId !== 'string' || typeof data.reused !== 'boolean') {
    throw new WechatDraftError('公众号发布服务返回的数据无效', 'api')
  }
  return { mediaId: data.mediaId, reused: data.reused }
}

export async function setupWechatCredentials(
  appId: string,
  appSecret: string
): Promise<{ success: boolean; configured: boolean }> {
  const response = await fetch(`${wechatApiBaseUrl()}/setup-credential`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify({ appId, appSecret })
  })
  if (!response.ok) {
    throw await readError(response)
  }
  return response.json() as Promise<{ success: boolean; configured: boolean }>
}
