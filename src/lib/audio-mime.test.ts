import { describe, expect, it } from 'vitest'
import { selectAudioMime } from './audio-mime'

describe('selectAudioMime', () => {
  it('prefers WebM Opus when supported', () => {
    expect(selectAudioMime((mime) => mime === 'audio/webm;codecs=opus')).toBe(
      'audio/webm;codecs=opus',
    )
  })

  it('falls back to MP4 when WebM is unavailable', () => {
    expect(selectAudioMime((mime) => mime === 'audio/mp4')).toBe('audio/mp4')
  })

  it('lets the browser choose its default when no candidate is supported', () => {
    expect(selectAudioMime(() => false)).toBeUndefined()
  })
})
