import { useCallback, useEffect, useState } from 'react'
import { SAMPLE_NOTE_TYPES, type NoteType, type Recording } from '../domain/recording'
import { useRecorder } from '../hooks/use-recorder'
import { listRecordings } from '../lib/recording-db'
import { RecordingCard } from '../components/RecordingCard'
import { TypePicker } from '../components/TypePicker'

function formatElapsed(elapsedMs: number) {
  const seconds = Math.floor(elapsedMs / 1000)
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

export function HomePage({ recorder }: { recorder: ReturnType<typeof useRecorder> }) {
  const [selectedType, setSelectedType] = useState<NoteType>(SAMPLE_NOTE_TYPES[0])
  const [recent, setRecent] = useState<Recording[]>([])
  const [highlightedId, setHighlightedId] = useState<string | null>(null)

  const refresh = useCallback(async () => setRecent((await listRecordings()).slice(0, 2)), [])
  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => {
    if (!highlightedId) return
    document.getElementById(`recording-${highlightedId}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    const timer = window.setTimeout(() => setHighlightedId(null), 2000)
    return () => window.clearTimeout(timer)
  }, [highlightedId])

  const complete = async () => {
    const id = await recorder.stop()
    await refresh()
    if (id) setHighlightedId(id)
  }

  return (
    <section className="page home-page">
      <header className="topbar"><div><span className="eyebrow">VOICE INBOX</span><h1>记录此刻</h1></div></header>
      <TypePicker onChange={setSelectedType} selectedId={selectedType.id} />
      <section className="recorder-panel" aria-live="polite">
        <span className={recorder.state === 'recording' ? 'recording-indicator active' : 'recording-indicator'}>{recorder.state === 'recording' ? '正在录音' : recorder.state === 'paused' ? '已暂停' : '准备录音'}</span>
        <strong className="timer">{formatElapsed(recorder.elapsedMs)}</strong>
        {recorder.state === 'idle' && <button className="record-button" onClick={() => void recorder.start(selectedType)} type="button" aria-label="开始录音">●</button>}
        {recorder.state === 'recording' && <button className="record-button recording" onClick={recorder.pause} type="button">暂停</button>}
        {recorder.state === 'paused' && <button className="record-button" onClick={recorder.resume} type="button">继续</button>}
        {recorder.state !== 'idle' && <button className="text-button" onClick={() => void complete()} type="button">完成录音</button>}
        <p>{recorder.state === 'idle' ? '点击开始录音' : '请保持页面前台'}</p>
        {recorder.error && <div className="error-message" role="alert">{recorder.error}<button onClick={recorder.clearError} type="button">知道了</button></div>}
      </section>
      <section className="recent-section"><div className="section-head"><h2>最近录音</h2></div>{recent.length ? recent.map((recording) => <RecordingCard highlighted={recording.id === highlightedId} key={recording.id} recording={recording} />) : <p className="empty-state">还没有本地录音。</p>}</section>
    </section>
  )
}
