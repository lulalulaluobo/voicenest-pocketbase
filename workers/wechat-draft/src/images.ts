const MAX_COVER_IMAGE_BYTES = 5 * 1024 * 1024
const COVER_DATA_URL = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/

export interface CoverImage {
  blob: Blob
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp'
}

export function parseImageDataUrl(value: unknown): CoverImage {
  if (typeof value !== 'string') throw new Error('封面图片无效')

  const match = COVER_DATA_URL.exec(value)
  if (!match) throw new Error('仅支持 PNG、JPEG 或 WebP 图片')

  const binary = atob(match[2])
  if (!binary.length) throw new Error('封面图片不能为空')
  if (binary.length > MAX_COVER_IMAGE_BYTES) throw new Error('封面图片不能超过 5 MiB')

  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  return {
    blob: new Blob([bytes], { type: match[1] }),
    mimeType: match[1] as CoverImage['mimeType']
  }
}
