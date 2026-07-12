import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  appendChunk,
  createRecording,
  deleteRecording,
  getChunks,
  getRecording,
  recordingDb,
  recoverIncompleteRecordings,
} from './recording-db'

const draft = {
  id: 'recording-1',
  typeId: 'idea',
  typeName: '随想',
  mimeType: 'audio/webm',
  localTitle: '2026-07-12 随想',
}

const chunk = {
  id: 'chunk-1',
  recordingId: draft.id,
  index: 0,
  createdAt: '2026-07-12T00:00:05.000Z',
  blob: new Blob(['audio'], { type: draft.mimeType }),
  size: 5,
}

describe('recording database', () => {
  beforeEach(async () => {
    await recordingDb.delete()
    await recordingDb.open()
  })

  afterEach(async () => {
    await recordingDb.delete()
  })

  it('restores an unfinished recording without losing persisted chunks', async () => {
    await createRecording(draft)
    await appendChunk(chunk)

    await recoverIncompleteRecordings()

    expect((await getRecording(draft.id))?.status).toBe('recovered')
    expect(await getChunks(draft.id)).toHaveLength(1)
  })

  it('deletes a recording and every owned chunk', async () => {
    await createRecording(draft)
    await appendChunk(chunk)

    await deleteRecording(draft.id)

    expect(await getRecording(draft.id)).toBeUndefined()
    expect(await getChunks(draft.id)).toHaveLength(0)
  })
})
