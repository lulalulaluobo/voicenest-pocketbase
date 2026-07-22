import { useCallback, useEffect, useState } from 'react'
import { getChunks, getRecording, recordingDb, updateRecording } from '../lib/recording-db'
import { getASRConfig, getLLMConfig, getNoteTypes } from '../lib/config-store'
import { transcribeAudio } from '../lib/asr'
import { formatNote } from '../lib/llm'
import { enqueueObsidianNote, getAcknowledgedObsidianSourceIds } from '../lib/obsidian-queue'
import { cleanSyncedAudioChunks } from '../lib/retention'
import { getAudioRetention } from '../lib/config-store'
import { createSerialTaskRunner, shouldRetryProcessingError } from '../lib/processing-queue'

const runSerialProcessing = createSerialTaskRunner()
const MAX_RETRIES = 3

export function useProcessor() {
  const [isProcessing, setIsProcessing] = useState(false)

  const processRecording = useCallback((id: string, mode: 'full' | 'sync_only' = 'full') => {
    return runSerialProcessing(id, async () => {
      setIsProcessing(true)

      try {
        const rec = await getRecording(id)
        if (!rec) throw new Error('录音不存在')

        if (mode === 'full') {
          await updateRecording(id, { status: 'processing', errorMessage: undefined, updatedAt: new Date().toISOString() })
          
          // 2. 检查并读取分片（音频只存本地，无云端回退）
          let audioBlob: Blob
          const chunks = await getChunks(id)
          if (!chunks.length) {
            throw new Error('该录音的本地音频已被清理，无法重新处理。可在录音列表重新录制。')
          }
          // 3. 拼接音频 Blob
          audioBlob = new Blob(chunks.map(c => c.blob), { type: rec.mimeType })

          const transcript = await transcribeAudio(audioBlob, getASRConfig())
          await updateRecording(id, { transcript, updatedAt: new Date().toISOString() })

          const noteTypes = getNoteTypes()
          const currentType = noteTypes.find((type) => type.id === rec.typeId) || noteTypes[0]
          if (!currentType) throw new Error('未找到可用的笔记类型配置。')
          const llmConfig = currentType.overrideLLM && currentType.llmConfig ? currentType.llmConfig : getLLMConfig()
          const formatted = await formatNote(transcript, {
            name: currentType.name,
            prompt: currentType.prompt,
            template: currentType.template,
          }, llmConfig)
          await updateRecording(id, {
            localTitle: formatted.title,
            summary: formatted.markdown,
            updatedAt: new Date().toISOString(),
          })
          await enqueueObsidianNote(id, formatted.title, formatted.markdown, currentType.obsidianPath)
        } else {
          await updateRecording(id, { status: 'processing', errorMessage: undefined, updatedAt: new Date().toISOString() })
          const latest = await getRecording(id)
          if (!latest?.summary) throw new Error('未发现可同步的已整理笔记内容。')
          const noteTypes = getNoteTypes()
          const currentType = noteTypes.find((type) => type.id === latest.typeId) || noteTypes[0]
          if (!currentType) throw new Error('未找到可用的笔记类型配置。')
          await enqueueObsidianNote(id, latest.localTitle, latest.summary, currentType.obsidianPath)
        }

        await updateRecording(id, {
          status: 'queued',
          retryCount: 0,
          updatedAt: new Date().toISOString(),
        })
      } catch (error) {
        const latest = await getRecording(id)
        const retryCount = (latest?.retryCount ?? 0) + 1
        const retryable = shouldRetryProcessingError(error) && retryCount <= MAX_RETRIES
        const message = error instanceof Error ? error.message : '处理失败，请重试。'

        await updateRecording(id, {
          status: retryable ? 'waiting_network' : 'failed',
          retryCount,
          errorMessage: retryable ? `临时网络或服务错误，将自动重试（${retryCount}/${MAX_RETRIES}）：${message}` : message,
          updatedAt: new Date().toISOString(),
        })
      } finally {
        setIsProcessing(false)
      }
    })
  }, [])

  const processQueue = useCallback(async () => {
    if (!navigator.onLine) return
    const queued = await recordingDb.recordings.where('status').equals('queued').toArray()
    const acknowledged = await getAcknowledgedObsidianSourceIds(queued.map((recording) => recording.id))
    for (const id of acknowledged) {
      await updateRecording(id, { status: 'synced', updatedAt: new Date().toISOString() })
      if (getAudioRetention() === 'immediate') await cleanSyncedAudioChunks(id)
    }
    const waiting = await recordingDb.recordings.where('status').equals('waiting_network').toArray()
    for (const recording of waiting) {
      await processRecording(recording.id, recording.summary ? 'sync_only' : 'full')
    }
  }, [processRecording])

  useEffect(() => {
    const handleOnline = () => void processQueue()
    window.addEventListener('online', handleOnline)
    const retryTimer = window.setInterval(() => void processQueue(), 30_000)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.clearInterval(retryTimer)
    }
  }, [processQueue])

  return { isProcessing, processRecording, processQueue }
}
