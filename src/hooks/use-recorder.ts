import { useCallback, useEffect, useRef, useState } from 'react'
import type { UserNoteType } from '../lib/config-store'
import { appendChunk, createRecording, deleteRecording, finishRecording } from '../lib/recording-db'
import { selectAudioMime } from '../lib/audio-mime'

export type RecorderState = 'idle' | 'recording' | 'paused'

interface WakeLockSentinel {
  release(): Promise<void>
}

type WakeLockNavigator = Navigator & {
  wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinel> }
}

function recorderErrorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') return '麦克风权限被拒绝，请授权后重试。'
    if (error.name === 'NotFoundError') return '未找到可用的麦克风。'
    if (error.name === 'NotReadableError') return '麦克风当前不可用，请关闭占用它的应用后重试。'
  }
  return '无法开始录音，请重试。'
}

export function useRecorder() {
  const [state, setState] = useState<RecorderState>('idle')
  const [elapsedMs, setElapsedMs] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recordingIdRef = useRef<string | null>(null)
  const chunkIndexRef = useRef(0)
  const elapsedBeforeRef = useRef(0)
  const segmentStartedAtRef = useRef<number | null>(null)
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)
  const writeChainRef = useRef(Promise.resolve())
  const finalizingRef = useRef(false)

  useEffect(() => {
    if (state !== 'recording') return
    const timer = window.setInterval(() => {
      if (segmentStartedAtRef.current) {
        setElapsedMs(elapsedBeforeRef.current + Date.now() - segmentStartedAtRef.current)
      }
    }, 250)
    return () => window.clearInterval(timer)
  }, [state])

  const releaseWakeLock = useCallback(async () => {
    await wakeLockRef.current?.release().catch(() => undefined)
    wakeLockRef.current = null
  }, [])

  const complete = useCallback(async (status: 'ready' | 'interrupted') => {
    const recorder = recorderRef.current
    const recordingId = recordingIdRef.current
    if (!recorder || !recordingId || finalizingRef.current) return null

    finalizingRef.current = true
    const stopped = recorder.state === 'inactive' ? Promise.resolve() : new Promise<void>((resolve) => recorder.addEventListener('stop', () => resolve(), { once: true }))
    const durationMs = elapsedBeforeRef.current + (segmentStartedAtRef.current ? Date.now() - segmentStartedAtRef.current : 0)

    if (recorder.state !== 'inactive') recorder.stop()
    await stopped
    await writeChainRef.current.catch(() => undefined)
    streamRef.current?.getTracks().forEach((track) => track.stop())
    await finishRecording(recordingId, durationMs, status)
    await releaseWakeLock()

    recorderRef.current = null
    streamRef.current = null
    recordingIdRef.current = null
    segmentStartedAtRef.current = null
    elapsedBeforeRef.current = 0
    chunkIndexRef.current = 0
    finalizingRef.current = false
    setElapsedMs(0)
    setState('idle')
    return recordingId
  }, [releaseWakeLock])

  const start = useCallback(async (type: UserNoteType) => {
    setError(null)
    if (!window.isSecureContext) {
      setError('录音需要通过 HTTPS 页面打开。')
      return
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setError('当前浏览器不支持录音。')
      return
    }

    let stream: MediaStream | null = null
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = selectAudioMime(MediaRecorder.isTypeSupported)
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      const id = crypto.randomUUID()
      const actualMimeType = recorder.mimeType || mimeType || 'audio/webm'
      await createRecording({
        id,
        typeId: type.id,
        typeName: type.name,
        mimeType: actualMimeType,
        localTitle: `${new Date().toLocaleString('zh-CN')} ${type.name}`,
      })

      streamRef.current = stream
      recorderRef.current = recorder
      recordingIdRef.current = id
      chunkIndexRef.current = 0
      elapsedBeforeRef.current = 0
      segmentStartedAtRef.current = Date.now()
      writeChainRef.current = Promise.resolve()
      finalizingRef.current = false
      recorder.ondataavailable = (event) => {
        if (!event.data.size) return
        const chunk = {
          id: crypto.randomUUID(),
          recordingId: id,
          index: chunkIndexRef.current++,
          createdAt: new Date().toISOString(),
          blob: event.data,
          size: event.data.size,
        }
        writeChainRef.current = writeChainRef.current.then(() => appendChunk(chunk)).catch(() => {
          setError('本地存储失败，已停止录音。')
          void complete('interrupted')
        })
      }
      recorder.onerror = () => {
        setError('录音发生异常，已保存可用部分。')
        void complete('interrupted')
      }
      stream.getTracks().forEach((track) => {
        track.addEventListener('ended', () => {
          if (!finalizingRef.current) void complete('interrupted')
        }, { once: true })
      })

      const wakeLock = (navigator as WakeLockNavigator).wakeLock
      if (wakeLock) wakeLockRef.current = await wakeLock.request('screen').catch(() => null)
      recorder.start(5000)
      setState('recording')
    } catch (startError) {
      stream?.getTracks().forEach((track) => track.stop())
      setError(recorderErrorMessage(startError))
    }
  }, [complete])

  const pause = useCallback(() => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state !== 'recording') return
    recorder.pause()
    if (segmentStartedAtRef.current) elapsedBeforeRef.current += Date.now() - segmentStartedAtRef.current
    segmentStartedAtRef.current = null
    setElapsedMs(elapsedBeforeRef.current)
    setState('paused')
  }, [])

  const resume = useCallback(() => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state !== 'paused') return
    recorder.resume()
    segmentStartedAtRef.current = Date.now()
    setState('recording')
  }, [])

  const stop = useCallback(() => complete('ready'), [complete])

  const cancel = useCallback(async () => {
    const recordingId = await complete('interrupted')
    if (recordingId) await deleteRecording(recordingId)
  }, [complete])

  return { state, elapsedMs, error, start, pause, resume, stop, cancel, clearError: () => setError(null) }
}
