import { describe, expect, it } from 'vitest'
import { buildPlaybackBlob } from './audio-playback'

describe('buildPlaybackBlob', () => {
  it('preserves the MIME type recorded by the browser', () => {
    const blob = buildPlaybackBlob(
      [{ blob: new Blob(['audio'], { type: 'audio/mp4' }) }],
      'audio/mp4',
    )

    expect(blob.type).toBe('audio/mp4')
  })
})
