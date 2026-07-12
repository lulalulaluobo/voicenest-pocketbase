import { useState, useEffect, useCallback } from 'react'
import { getChunks, getRecording, recordingDb } from '../lib/recording-db'
import { getASRConfig, getLLMConfig, getSyncConfig, getNoteTypes, getAudioRetention } from '../lib/config-store'
import { transcribeAudio } from '../lib/asr'
import { formatNote } from '../lib/llm'
import { syncToObsidian } from '../lib/sync'
import { cleanSyncedAudioChunks } from '../lib/retention'
import type { Recording } from '../domain/recording'

// 全局排队锁，避免前台自动重试时产生并发请求
let isQueueProcessing = false

export function useProcessor() {
  const [isProcessing, setIsProcessing] = useState(false)

  const processRecording = useCallback(async (id: string, mode: 'full' | 'sync_only' = 'full') => {
    setIsProcessing(true)
    
    try {
      const rec = await getRecording(id)
      if (!rec) {
        throw new Error('录音不存在')
      }

      // 如果是全流程，我们需要跑 ASR + LLM + Sync
      if (mode === 'full') {
        // 1. 设置状态为处理中并清除之前的报错
        await recordingDb.recordings.update(id, {
          status: 'processing',
          errorMessage: undefined,
          updatedAt: new Date().toISOString()
        })

        // 2. 检查并读取分片
        const chunks = await getChunks(id)
        if (!chunks.length) {
          throw new Error('该录音没有可用的音频分片数据。')
        }

        // 3. 拼接音频 Blob
        const audioBlob = new Blob(chunks.map(c => c.blob), { type: rec.mimeType })

        // 4. 调用 ASR
        let transcriptText = ''
        try {
          transcriptText = await transcribeAudio(audioBlob, getASRConfig())
        } catch (err: any) {
          throw new Error(`ASR 转换失败: ${err.message}`)
        }

        // 更新 ASR 结果到本地数据库
        await recordingDb.recordings.update(id, {
          transcript: transcriptText,
          updatedAt: new Date().toISOString()
        })

        // 5. 调用 LLM 整理
        const noteTypes = getNoteTypes()
        const currentType = noteTypes.find(t => t.id === rec.typeId) || noteTypes[0]

        // 检查是否有类型级的专属 LLM 覆盖，若没有，用全局配置
        const llmConfig = (currentType.overrideLLM && currentType.llmConfig) 
          ? currentType.llmConfig 
          : getLLMConfig()

        let formatted: { title: string; markdown: string }
        try {
          formatted = await formatNote(
            transcriptText,
            {
              name: currentType.name,
              prompt: currentType.prompt,
              template: currentType.template
            },
            llmConfig
          )
        } catch (err: any) {
          throw new Error(`LLM 整理失败: ${err.message}`)
        }

        // 更新整理结果与标题到本地数据库
        await recordingDb.recordings.update(id, {
          localTitle: formatted.title,
          summary: formatted.markdown,
          updatedAt: new Date().toISOString()
        })

        // 6. 执行 Fast Note Sync 同步
        try {
          await syncToObsidian(formatted.title, formatted.markdown, currentType.obsidianPath, getSyncConfig())
        } catch (err: any) {
          // ASR + LLM 已经完成了，只是同步失败，更新本地数据并抛出同步错误
          await recordingDb.recordings.update(id, {
            status: 'failed',
            errorMessage: `已完成转写整理，但写入 Obsidian 失败: ${err.message}`,
            updatedAt: new Date().toISOString()
          })
          return
        }

        // 7. 处理完成，成功同步
        await recordingDb.recordings.update(id, {
          status: 'synced',
          updatedAt: new Date().toISOString()
        })

        // 触发立即删除音频分片策略
        if (getAudioRetention() === 'immediate') {
          await cleanSyncedAudioChunks(id)
        }
      } else if (mode === 'sync_only') {
        // 仅重新同步已整理的内容
        await recordingDb.recordings.update(id, {
          status: 'processing',
          errorMessage: undefined,
          updatedAt: new Date().toISOString()
        })

        const latestRec = await getRecording(id)
        if (!latestRec || !latestRec.summary) {
          throw new Error('未发现可同步的已整理笔记内容。')
        }

        const noteTypes = getNoteTypes()
        const currentType = noteTypes.find(t => t.id === latestRec.typeId) || noteTypes[0]

        try {
          await syncToObsidian(latestRec.localTitle, latestRec.summary, currentType.obsidianPath, getSyncConfig())
        } catch (err: any) {
          throw new Error(`写入 Obsidian 失败: ${err.message}`)
        }

        // 成功同步
        await recordingDb.recordings.update(id, {
          status: 'synced',
          updatedAt: new Date().toISOString()
        })

        // 触发立即删除音频分片策略
        if (getAudioRetention() === 'immediate') {
          await cleanSyncedAudioChunks(id)
        }
      }
    } catch (err: any) {
      // 捕获异常，写回 errorMessage，状态置为 failed
      await recordingDb.recordings.update(id, {
        status: 'failed',
        errorMessage: err.message,
        updatedAt: new Date().toISOString()
      })
    } finally {
      setIsProcessing(false)
    }
  }, [])

  // 消费处于等待网络或同步失败的任务队列
  const processQueue = useCallback(async () => {
    if (isQueueProcessing || !navigator.onLine) return
    isQueueProcessing = true

    try {
      // 拉取所有处于 waiting_network 状态的任务
      const list = await recordingDb.recordings.where('status').equals('waiting_network').toArray()
      
      // 顺次执行整理与同步
      for (const item of list) {
        await processRecording(item.id, 'full')
      }
    } catch (err) {
      console.error('Queue processing error', err)
    } finally {
      isQueueProcessing = false
    }
  }, [processRecording])

  // 前台在线网络状态监听
  useEffect(() => {
    const handleOnline = () => {
      void processQueue()
    }

    window.addEventListener('online', handleOnline)
    return () => {
      window.removeEventListener('online', handleOnline)
    }
  }, [processQueue])

  return {
    isProcessing,
    processRecording,
    processQueue
  }
}
