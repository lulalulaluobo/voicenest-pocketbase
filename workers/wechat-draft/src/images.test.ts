import { describe, expect, it } from 'vitest'
import { parseImageDataUrl } from './images'

describe('cover image parsing', () => {
  it('accepts a PNG data URL within the upload limit', () => {
    const image = parseImageDataUrl('data:image/png;base64,AA==')

    expect(image.mimeType).toBe('image/png')
    expect(image.blob.size).toBe(1)
  })

  it('rejects unsupported image types', () => {
    expect(() => parseImageDataUrl('data:image/gif;base64,AA==')).toThrow('仅支持 PNG、JPEG 或 WebP 图片')
  })

  it('rejects images larger than 5 MiB after decoding', () => {
    const base64 = 'A'.repeat(Math.ceil((5 * 1024 * 1024 + 1) / 3) * 4)

    expect(() => parseImageDataUrl(`data:image/png;base64,${base64}`)).toThrow('封面图片不能超过 5 MiB')
  })
})
