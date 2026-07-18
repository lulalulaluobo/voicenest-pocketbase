import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./config-store', () => ({
  getAudioRetention: vi.fn(),
  getTextRetention: vi.fn(),
}))

import { getAudioRetention, getTextRetention } from './config-store'
import { recordingDb } from './recording-db'
import { sweepExpiredStorage } from './retention'

describe('retention', () => {
  beforeEach(async () => {
    await recordingDb.delete()
    await recordingDb.open()
  })

  afterEach(async () => {
    await recordingDb.delete()
  })

  it('clears expired text without deleting audio kept forever', async () => {
    vi.mocked(getAudioRetention).mockReturnValue('forever')
    vi.mocked(getTextRetention).mockReturnValue('7d')
    const id = 'old-recording'
    await recordingDb.recordings.add({
      id,
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-01T00:00:00.000Z',
      typeId: 'idea',
      typeName: '随想',
      durationMs: 1000,
      mimeType: 'audio/webm',
      chunkIds: ['chunk-1'],
      status: 'synced',
      recovered: false,
      interrupted: false,
      localTitle: '旧录音',
      transcript: '旧转写',
      summary: '旧整理',
    })
    await recordingDb.audioChunks.add({
      id: 'chunk-1', recordingId: id, index: 0, createdAt: '2020-01-01T00:00:00.000Z', blob: new Blob(['audio']), size: 5,
    })

    await sweepExpiredStorage()

    const recording = await recordingDb.recordings.get(id)
    expect(recording?.transcript).toBeUndefined()
    expect(recording?.summary).toBeUndefined()
    expect(await recordingDb.audioChunks.where('recordingId').equals(id).count()).toBe(1)
  })
})
