import type { ImageMimeType, WechatCoverImage } from './types'

const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const IMAGE_MIME_TYPES = new Set<ImageMimeType>(['image/png', 'image/jpeg', 'image/webp'])

export class ImageDataError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ImageDataError'
  }
}

export interface ParsedImageData {
  mimeType: ImageMimeType
  bytes: Uint8Array
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  }
  return btoa(binary)
}

function decodeBase64(value: string): Uint8Array {
  try {
    const binary = atob(value)
    return Uint8Array.from(binary, (character) => character.charCodeAt(0))
  } catch {
    throw new ImageDataError('封面图片数据无效')
  }
}

export function parseImageDataUrl(dataUrl: string): ParsedImageData {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl)
  if (!match || !IMAGE_MIME_TYPES.has(match[1] as ImageMimeType)) {
    throw new ImageDataError('封面只支持 PNG、JPEG 或 WebP 图片')
  }
  const bytes = decodeBase64(match[2])
  if (!bytes.byteLength || bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new ImageDataError('封面图片必须大于 0 且不超过 5 MiB')
  }
  return { mimeType: match[1] as ImageMimeType, bytes }
}

export function toImageDataUrl(mimeType: ImageMimeType, bytes: Uint8Array): WechatCoverImage {
  if (!IMAGE_MIME_TYPES.has(mimeType) || !bytes.byteLength || bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new ImageDataError('Agnes 返回的封面图片无效')
  }
  return { mimeType, dataUrl: `data:${mimeType};base64,${encodeBase64(bytes)}` }
}
