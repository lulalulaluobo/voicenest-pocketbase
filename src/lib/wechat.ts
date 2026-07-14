import type { WechatDraftConfig } from './config-store'

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

export class WechatDraftError extends Error {
  constructor(
    message: string,
    public readonly kind: 'authorization' | 'ip_whitelist' | 'api'
  ) {
    super(message)
    this.name = 'WechatDraftError'
  }
}

function workerBaseUrl(config: WechatDraftConfig): string {
  const url = config.workerUrl.replace(/\/+$/, '')
  if (!url) {
    throw new WechatDraftError('请先填写公众号发布服务地址', 'api')
  }
  return url
}

async function readError(response: Response): Promise<WechatDraftError> {
  if (response.status === 401 || response.status === 403) {
    return new WechatDraftError('公众号发布授权已过期，请重新授权', 'authorization')
  }

  const data = await response.json().catch(() => null) as { code?: string; message?: string } | null
  if (data?.code === 'WECHAT_IP_NOT_ALLOWED') {
    return new WechatDraftError('公众号 IP 白名单未配置，请先运行连接测试', 'ip_whitelist')
  }
  return new WechatDraftError(data?.message || `公众号发布服务请求失败 (${response.status})`, 'api')
}

export async function testWechatConnection(config: WechatDraftConfig): Promise<void> {
  const response = await fetch(`${workerBaseUrl(config)}/connection-test`, {
    method: 'POST',
    credentials: 'include'
  })
  if (!response.ok) {
    throw await readError(response)
  }
}

export async function publishWechatDraft(
  config: WechatDraftConfig,
  request: WechatDraftRequest
): Promise<WechatDraftResult> {
  const response = await fetch(`${workerBaseUrl(config)}/drafts`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
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
