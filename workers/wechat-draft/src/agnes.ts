import { ImageDataError, parseImageDataUrl, toImageDataUrl } from './images'
import type { CoverGenerateRequest, Env, ImageMimeType, WechatCoverImage } from './types'

const AGNES_IMAGE_URL = 'https://apihub.agnes-ai.com/v1/images/generations'

export class CoverError extends Error {
  constructor(public readonly code: 'AGNES_NOT_CONFIGURED' | 'AGNES_API_ERROR' | 'AGNES_IMAGE_INVALID', message: string) {
    super(message)
    this.name = 'CoverError'
  }
}

function buildCoverPrompt(input: CoverGenerateRequest): string {
  return `任务：为微信公众号文章生成一张横版封面。\n\n创作方向：${input.prompt}\n\n文章主题素材（文章仅用于理解核心主题，绝不复刻标题、正文或任何文字）：\n标题：${input.title}\n正文：${input.markdown}\n\n参考图规则：参考图仅用于借鉴配色、光影、质感与氛围，禁止复制其文字、版式、主体、标志或水印。\n\n输出要求：先根据文章主题提炼一个抽象或场景化的视觉隐喻，再创作全新画面。画面约 2.35:1，保持克制、留有呼吸感与明显留白；画面中不得出现任何可读文字、标题、段落、Logo 或水印。`
}

function imageMimeFromBytes(bytes: Uint8Array): ImageMimeType | undefined {
  if (bytes.length >= 4 && bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71) return 'image/png'
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg'
  if (bytes.length >= 12 && String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP') return 'image/webp'
  return undefined
}

async function downloadImage(url: string | undefined, fetchFn: typeof fetch): Promise<WechatCoverImage> {
  if (!url) throw new CoverError('AGNES_API_ERROR', 'Agnes 未返回封面图片地址')
  const response = await fetchFn(url)
  const mimeType = response.headers.get('Content-Type')?.split(';', 1)[0] as ImageMimeType | undefined
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (!response.ok || !mimeType || imageMimeFromBytes(bytes) !== mimeType) {
    throw new CoverError('AGNES_IMAGE_INVALID', 'Agnes 返回的封面图片无法下载')
  }
  try {
    return toImageDataUrl(mimeType, bytes)
  } catch (error) {
    throw new CoverError('AGNES_IMAGE_INVALID', error instanceof Error ? error.message : 'Agnes 返回的封面图片无效')
  }
}

function base64Image(value: string): WechatCoverImage {
  try {
    const parsed = parseImageDataUrl(`data:image/png;base64,${value}`)
    const mimeType = imageMimeFromBytes(parsed.bytes)
    if (!mimeType) throw new ImageDataError('Agnes 返回的封面图片格式无效')
    return toImageDataUrl(mimeType, parsed.bytes)
  } catch (error) {
    throw new CoverError('AGNES_IMAGE_INVALID', error instanceof Error ? error.message : 'Agnes 返回的封面图片无效')
  }
}

export async function generateAgnesCover(
  env: Env,
  input: CoverGenerateRequest,
  fetchFn: typeof fetch = fetch
): Promise<WechatCoverImage> {
  if (!env.AGNES_API_KEY) throw new CoverError('AGNES_NOT_CONFIGURED', '封面生成服务尚未配置')
  if (input.referenceImageDataUrl) parseImageDataUrl(input.referenceImageDataUrl)

  const response = await fetchFn(AGNES_IMAGE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.AGNES_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'agnes-image-2.0-flash',
      prompt: buildCoverPrompt(input),
      size: '1200x510',
      n: 1,
      ...(input.referenceImageDataUrl ? {
        tags: ['img2img'],
        extra_body: { image: [input.referenceImageDataUrl], response_format: 'url' }
      } : {})
    })
  })
  const data = await response.json().catch(() => null) as { data?: Array<{ url?: string; b64_json?: string }>; error?: { message?: string } } | null
  const image = data?.data?.[0]
  if (!response.ok || !image) {
    throw new CoverError('AGNES_API_ERROR', data?.error?.message || `Agnes 请求失败 (${response.status})`)
  }
  return image.b64_json ? base64Image(image.b64_json) : downloadImage(image.url, fetchFn)
}
