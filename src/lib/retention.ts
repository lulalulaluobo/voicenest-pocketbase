import { recordingDb, updateRecording, deleteRecording } from './recording-db'
import { getAudioRetention, getTextRetention } from './config-store'

/**
 * 立即清理指定录音已同步的音频二进制数据以释放空间
 */
export async function cleanSyncedAudioChunks(id: string): Promise<void> {
  await recordingDb.transaction('rw', recordingDb.recordings, recordingDb.audioChunks, async () => {
    const recording = await recordingDb.recordings.get(id)
    if (recording && recording.status === 'synced') {
      await recordingDb.audioChunks.where('recordingId').equals(id).delete()
      await updateRecording(id, {
        chunkIds: [],
        isAudioCleared: true,
        updatedAt: new Date().toISOString()
      })
      console.log(`已成功释放录音 [${id}] 的音频二进制分片空间`)
    }
  })
}

/**
 * 执行数据保留清理策略，自动扫描并清除已过期同步任务的数据
 */
export async function sweepExpiredStorage(): Promise<void> {
  const audioPolicy = getAudioRetention() // 'immediate' | '7d' | '30d' | 'forever'
  const textPolicy = getTextRetention()   // '7d' | '30d' | 'forever'

  console.log(`[Retention] 开始扫描本地过期存储... 音频策略: ${audioPolicy}, 文本策略: ${textPolicy}`)

  const now = new Date()

  // 1. 处理文本和录音记录的过期清理 (Text retention)
  if (textPolicy !== 'forever') {
    const days = textPolicy === '7d' ? 7 : 30
    const cutoffDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
    
    // 找出所有早于 cutoff 且状态为 synced 的笔记，仅清除文本内容。
    const expiredRecordings = await recordingDb.recordings
      .where('status')
      .equals('synced')
      .filter(r => new Date(r.createdAt) < cutoffDate)
      .toArray()

    if (expiredRecordings.length > 0) {
      console.log(`[Retention] 扫描到 ${expiredRecordings.length} 条已同步文本到期记录`)
      for (const rec of expiredRecordings) {
        await updateRecording(rec.id, {
          transcript: undefined,
          summary: undefined,
          updatedAt: new Date().toISOString()
        })
      }
    }
  }

  // 2. 处理音频分片的过期清理 (Audio retention)
  if (audioPolicy !== 'forever' && audioPolicy !== 'immediate') {
    const days = audioPolicy === '7d' ? 7 : 30
    const cutoffDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)

    // 找出所有早于 cutoff、已同步、且音频尚未被清空的记录
    const expiredAudios = await recordingDb.recordings
      .where('status')
      .equals('synced')
      .filter(r => !r.isAudioCleared && new Date(r.createdAt) < cutoffDate)
      .toArray()

    if (expiredAudios.length > 0) {
      console.log(`[Retention] 扫描到 ${expiredAudios.length} 条已同步音频到期分片清除记录`)
      for (const rec of expiredAudios) {
        await cleanSyncedAudioChunks(rec.id)
      }
    }
  }
}
