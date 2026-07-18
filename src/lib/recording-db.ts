import Dexie, { type Table } from 'dexie'
import type { AudioChunk, Recording } from '../domain/recording'

// 录音数据全部存储在本地 IndexedDB，不再同步到 PocketBase 云端。
// PocketBase 后端只负责用户认证与微信公众号草稿桥接，不存储任何录音/音频/文本。
class RecordingDatabase extends Dexie {
  recordings!: Table<Recording, string>
  audioChunks!: Table<AudioChunk, string>

  constructor() {
    super('voice-inbox')
    this.version(1).stores({
      recordings: 'id, createdAt, status',
      audioChunks: 'id, recordingId, [recordingId+index]',
    })
    this.version(2).stores({
      recordings: 'id, createdAt, status, typeId',
      audioChunks: 'id, recordingId, [recordingId+index]',
    })
    this.version(4).stores({
      recordings: 'id, createdAt, status, typeId',
      audioChunks: 'id, recordingId, [recordingId+index]',
    })
  }
}

export const recordingDb = new RecordingDatabase()

export async function createRecording(
  input: Pick<Recording, 'id' | 'typeId' | 'typeName' | 'mimeType' | 'localTitle'>,
): Promise<Recording> {
  const now = new Date().toISOString()
  const recording: Recording = {
    ...input,
    createdAt: now,
    updatedAt: now,
    durationMs: 0,
    chunkIds: [],
    status: 'recording',
    recovered: false,
    interrupted: false,
  }

  await recordingDb.recordings.add(recording)
  return recording
}

export async function appendChunk(chunk: AudioChunk): Promise<void> {
  await recordingDb.transaction('rw', recordingDb.recordings, recordingDb.audioChunks, async () => {
    const recording = await recordingDb.recordings.get(chunk.recordingId)
    if (!recording) {
      throw new Error('录音不存在')
    }

    await recordingDb.audioChunks.add(chunk)
    await recordingDb.recordings.update(recording.id, {
      chunkIds: [...recording.chunkIds, chunk.id],
      updatedAt: new Date().toISOString(),
    })
  })
}

export async function getRecording(id: string): Promise<Recording | undefined> {
  return recordingDb.recordings.get(id)
}

export async function listRecordings(): Promise<Recording[]> {
  return recordingDb.recordings.orderBy('createdAt').reverse().toArray()
}

export async function getChunks(recordingId: string): Promise<AudioChunk[]> {
  return recordingDb.audioChunks.where('recordingId').equals(recordingId).sortBy('index')
}

export async function finishRecording(
  id: string,
  durationMs: number,
  status: 'ready' | 'interrupted',
): Promise<void> {
  await recordingDb.recordings.update(id, {
    durationMs,
    status,
    interrupted: status === 'interrupted',
    updatedAt: new Date().toISOString(),
  })
}

export async function updateRecording(id: string, changes: Partial<Recording>): Promise<void> {
  await recordingDb.recordings.update(id, changes)
}

export async function recoverIncompleteRecordings(): Promise<void> {
  const unfinished = await recordingDb.recordings.where('status').equals('recording').toArray()
  for (const recording of unfinished) {
    const updated = {
      ...recording,
      status: 'recovered' as const,
      recovered: true,
      updatedAt: new Date().toISOString(),
    }
    await recordingDb.recordings.put(updated)
  }
}

export async function deleteRecording(id: string): Promise<void> {
  await recordingDb.transaction('rw', recordingDb.recordings, recordingDb.audioChunks, async () => {
    await recordingDb.audioChunks.where('recordingId').equals(id).delete()
    await recordingDb.recordings.delete(id)
  })
}
