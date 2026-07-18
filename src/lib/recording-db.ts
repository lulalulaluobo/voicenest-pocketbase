import Dexie, { type Table } from 'dexie'
import type { AudioChunk, Recording } from '../domain/recording'
import { pb } from './pocketbase'

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

function mapPocketBaseRecordToRecording(record: any): Recording {
  return {
    id: record.localId || record.id,
    createdAt: record.created,
    updatedAt: record.updated,
    typeId: record.typeId,
    typeName: record.typeName,
    durationMs: record.durationMs,
    mimeType: record.mimeType,
    chunkIds: [],
    status: record.status as any,
    recovered: record.recovered,
    interrupted: record.interrupted,
    localTitle: record.localTitle,
    transcript: record.transcript,
    summary: record.summary,
    errorMessage: record.errorMessage,
    isAudioCleared: record.isAudioCleared,
    audioUrl: pb.files.getUrl(record, record.audio),
    wechatStatus: record.wechatStatus as any,
    wechatDraftMediaId: record.wechatDraftMediaId,
    wechatErrorMessage: record.wechatErrorMessage,
    wechatRequestId: record.wechatRequestId,
    wechatTitle: record.wechatTitle,
    wechatMarkdown: record.wechatMarkdown
  } as Recording
}

export async function syncRecordingToCloud(id: string): Promise<void> {
  if (!pb.authStore.isValid || !navigator.onLine) return
  try {
    const rec = await recordingDb.recordings.get(id)
    if (!rec || rec.status === 'recording') return

    let remoteRecord: any = null
    try {
      remoteRecord = await pb.collection('recordings').getFirstListItem(`localId="${id}"`)
    } catch (_) {}

    const formData = new FormData()
    formData.append('userId', pb.authStore.model?.id || '')
    formData.append('localId', rec.id)
    formData.append('typeId', rec.typeId)
    formData.append('typeName', rec.typeName)
    formData.append('durationMs', rec.durationMs.toString())
    formData.append('mimeType', rec.mimeType)
    formData.append('status', rec.status)
    formData.append('recovered', rec.recovered ? 'true' : 'false')
    formData.append('interrupted', rec.interrupted ? 'true' : 'false')
    formData.append('localTitle', rec.localTitle)
    formData.append('transcript', rec.transcript || '')
    formData.append('summary', rec.summary || '')
    formData.append('errorMessage', rec.errorMessage || '')
    formData.append('isAudioCleared', rec.isAudioCleared ? 'true' : 'false')

    if (rec.wechatStatus) formData.append('wechatStatus', rec.wechatStatus)
    if (rec.wechatDraftMediaId) formData.append('wechatDraftMediaId', rec.wechatDraftMediaId)
    if (rec.wechatErrorMessage) formData.append('wechatErrorMessage', rec.wechatErrorMessage)
    if (rec.wechatRequestId) formData.append('wechatRequestId', rec.wechatRequestId)
    if (rec.wechatTitle) formData.append('wechatTitle', rec.wechatTitle)
    if (rec.wechatMarkdown) formData.append('wechatMarkdown', rec.wechatMarkdown)

    if (!rec.isAudioCleared) {
      const hasAudioOnCloud = remoteRecord && remoteRecord.audio
      if (!hasAudioOnCloud) {
        const chunks = await getChunks(id)
        if (chunks.length) {
          const audioBlob = new Blob(chunks.map(c => c.blob), { type: rec.mimeType })
          const ext = rec.mimeType.includes('mp4') ? 'mp4' : rec.mimeType.includes('wav') ? 'wav' : 'webm'
          formData.append('audio', new File([audioBlob], `audio.${ext}`, { type: rec.mimeType }))
        }
      }
    }

    if (remoteRecord) {
      await pb.collection('recordings').update(remoteRecord.id, formData)
    } else {
      await pb.collection('recordings').create(formData)
    }
  } catch (err) {
    console.error('同步音频记录到云端失败:', err)
  }
}

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
  if (pb.authStore.isValid && navigator.onLine) {
    try {
      const record = await pb.collection('recordings').getFirstListItem(`localId="${id}" || id="${id}"`)
      return mapPocketBaseRecordToRecording(record)
    } catch (err) {
      console.warn('获取云端录音详情失败，降级本地:', err)
    }
  }
  return recordingDb.recordings.get(id)
}

export async function listRecordings(): Promise<Recording[]> {
  if (pb.authStore.isValid && navigator.onLine) {
    try {
      const records = await pb.collection('recordings').getFullList({
        sort: '-created'
      })
      return records.map(mapPocketBaseRecordToRecording)
    } catch (err) {
      console.error('拉取云端录音列表失败，降级本地:', err)
    }
  }
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
  void syncRecordingToCloud(id)
}

export async function updateRecording(id: string, changes: Partial<Recording>): Promise<void> {
  await recordingDb.recordings.update(id, changes)
  void syncRecordingToCloud(id)
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
    void syncRecordingToCloud(recording.id)
  }
}

export async function deleteRecording(id: string): Promise<void> {
  await recordingDb.transaction('rw', recordingDb.recordings, recordingDb.audioChunks, async () => {
    await recordingDb.audioChunks.where('recordingId').equals(id).delete()
    await recordingDb.recordings.delete(id)
  })

  if (pb.authStore.isValid && navigator.onLine) {
    try {
      const record = await pb.collection('recordings').getFirstListItem(`localId="${id}"`)
      await pb.collection('recordings').delete(record.id)
    } catch (_) {}
  }
}
