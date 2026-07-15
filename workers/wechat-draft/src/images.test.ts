import { describe, expect, it } from 'vitest'
import { ImageDataError, parseImageDataUrl } from './images'

describe('cover image data', () => {
  it('accepts a PNG data URL and rejects unsupported image data', () => {
    expect(parseImageDataUrl('data:image/png;base64,iVBORw==')).toMatchObject({ mimeType: 'image/png', bytes: new Uint8Array([137, 80, 78, 71]) })
    expect(() => parseImageDataUrl('data:image/gif;base64,R0lGODlh')).toThrow(ImageDataError)
  })
})
