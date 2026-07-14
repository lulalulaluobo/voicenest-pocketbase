import { describe, expect, it, vi } from 'vitest'
import { getRecordingAudioBlob } from './recording-audio'

vi.mock('ts-ebml', () => ({
  Decoder: class { decode = vi.fn(() => [{ name: 'EBML' }]) },
  Reader: class {
    logging = true
    metadatas = [{ name: 'EBML' }]
    duration = 6000
    cues = [{ CueTrack: 1, CueClusterPosition: 12, CueTime: 0 }]
    metadataSize = 4
    read = vi.fn()
    stop = vi.fn()
  },
  tools: { makeMetadataSeekable: vi.fn(() => new Uint8Array([9, 9]).buffer) },
}))

const base = {
  id: 'audio-1', createdAt: '', updatedAt: '', typeId: 'idea', typeName: '随想',
  durationMs: 6000, chunkIds: [], status: 'ready' as const, recovered: false,
  interrupted: false, localTitle: '标题',
}

describe('getRecordingAudioBlob', () => {
  it('passes MP4 through without remuxing', async () => {
    const blob = await getRecordingAudioBlob({ ...base, mimeType: 'audio/mp4' }, [
      new Blob(['mp4'], { type: 'audio/mp4' }),
    ])
    expect(await blob.text()).toBe('mp4')
  })

  it('prepends seekable WebM metadata', async () => {
    const blob = await getRecordingAudioBlob({ ...base, mimeType: 'audio/webm;codecs=opus' }, [
      new Blob([new Uint8Array([1, 2, 3, 4, 5])], { type: 'audio/webm' }),
    ])
    expect([...new Uint8Array(await blob.arrayBuffer())]).toEqual([9, 9, 5])
  })
})
