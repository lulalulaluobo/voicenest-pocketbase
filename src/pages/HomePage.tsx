import { useCallback, useEffect, useState } from 'react'
import type { Recording } from '../domain/recording'
import { useRecorder } from '../hooks/use-recorder'
import { listRecordings, recordingDb } from '../lib/recording-db'
import { RecordingCard } from '../components/RecordingCard'
import { TypePicker } from '../components/TypePicker'
import { getNoteTypes, type UserNoteType } from '../lib/config-store'
import { useProcessor } from '../hooks/use-processor'

function formatElapsed(elapsedMs: number) {
  const seconds = Math.floor(elapsedMs / 1000)
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

export function HomePage({ recorder }: { recorder: ReturnType<typeof useRecorder> }) {
  const [types, setTypes] = useState<UserNoteType[]>([])
  const [selectedType, setSelectedType] = useState<UserNoteType | null>(null)
  const [recent, setRecent] = useState<Recording[]>([])
  const [highlightedId, setHighlightedId] = useState<string | null>(null)

  const { processRecording } = useProcessor()

  const refresh = useCallback(async () => {
    setRecent((await listRecordings()).slice(0, 2))
    const noteTypes = getNoteTypes()
    setTypes(noteTypes)
    // 首次加载如果没有设置 selectedType，则默认选中 default 或第 0 个
    if (!selectedType && noteTypes.length > 0) {
      const def = noteTypes.find((t) => t.isDefault) || noteTypes[0]
      setSelectedType(def)
    }
  }, [selectedType])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!highlightedId) return
    document.getElementById(`recording-${highlightedId}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    const timer = window.setTimeout(() => setHighlightedId(null), 2000)
    return () => window.clearTimeout(timer)
  }, [highlightedId])

  const complete = async () => {
    if (!selectedType) return
    const id = await recorder.stop()
    await refresh()
    if (id) {
      setHighlightedId(id)
      
      // 开启了“自动整理”时：
      const autoProcess = localStorage.getItem('vn_auto_process') === 'true'
      if (autoProcess) {
        if (navigator.onLine) {
          // 在线：开始全链路 ASR + LLM + Sync 处理
          void processRecording(id, 'full').then(() => refresh())
        } else {
          // 离线：把当前录音卡片置为等待网络状态，前台联网会自动重试
          await recordingDb.recordings.update(id, {
            status: 'waiting_network',
            updatedAt: new Date().toISOString()
          })
          await refresh()
        }
      }
    }
  }

  return (
    <section className="page home-page">
      <header className="topbar">
        <div>
          <span className="eyebrow">VOICE INBOX</span>
          <h1>记录此刻</h1>
        </div>
      </header>

      {types.length > 0 && selectedType && (
        <TypePicker
          onChange={setSelectedType}
          selectedId={selectedType.id}
          types={types}
        />
      )}

      <section className="recorder-panel" aria-live="polite">
        <span className={recorder.state === 'recording' ? 'recording-indicator active' : 'recording-indicator'}>
          {recorder.state === 'recording' ? '正在录音' : recorder.state === 'paused' ? '已暂停' : '准备录音'}
        </span>
        <strong className="timer">{formatElapsed(recorder.elapsedMs)}</strong>
        {recorder.state === 'idle' && selectedType && (
          <button
            className="record-button"
            onClick={() => void recorder.start(selectedType)}
            type="button"
            aria-label="开始录音"
          >
            ●
          </button>
        )}
        {recorder.state === 'recording' && <button className="record-button recording" onClick={recorder.pause} type="button">暂停</button>}
        {recorder.state === 'paused' && <button className="record-button" onClick={recorder.resume} type="button">继续</button>}
        {recorder.state !== 'idle' && <button className="text-button" onClick={() => void complete()} type="button">完成录音</button>}
        <p>{recorder.state === 'idle' ? '点击开始录音' : '请保持页面前台'}</p>
        {recorder.error && <div className="error-message" role="alert">{recorder.error}<button onClick={recorder.clearError} type="button">知道了</button></div>}
      </section>

      <section className="recent-section">
        <div className="section-head">
          <h2>最近录音</h2>
        </div>
        {recent.length ? (
          recent.map((recording) => (
            <RecordingCard highlighted={recording.id === highlightedId} key={recording.id} recording={recording} />
          ))
        ) : (
          <p className="empty-state">还没有本地录音。</p>
        )}
      </section>
    </section>
  )
}
