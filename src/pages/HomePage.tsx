import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Recording } from '../domain/recording'
import { useRecorder } from '../hooks/use-recorder'
import { listRecordings, recordingDb } from '../lib/recording-db'
import { RecordingCard } from '../components/RecordingCard'
import { getNoteTypes, type UserNoteType } from '../lib/config-store'
import { useProcessor } from '../hooks/use-processor'
import { ThemeToggle } from '../components/ThemeToggle'

function formatElapsed(elapsedMs: number) {
  const seconds = Math.floor(elapsedMs / 1000)
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

export function HomePage({ recorder }: { recorder: ReturnType<typeof useRecorder> }) {
  const navigate = useNavigate()
  const [types, setTypes] = useState<UserNoteType[]>([])
  const [selectedType, setSelectedType] = useState<UserNoteType | null>(null)
  const [recent, setRecent] = useState<Recording[]>([])
  const [highlightedId, setHighlightedId] = useState<string | null>(null)
  
  // 底部抽屉与遮罩
  const [showMoreSheet, setShowMoreSheet] = useState(false)

  const { processRecording } = useProcessor()

  const refresh = useCallback(async () => {
    setRecent((await listRecordings()).slice(0, 2))
    const noteTypes = getNoteTypes()
    setTypes(noteTypes)
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
      
      const autoProcess = localStorage.getItem('vn_auto_process') === 'true'
      if (autoProcess) {
        if (navigator.onLine) {
          void processRecording(id, 'full').then(() => refresh())
        } else {
          await recordingDb.recordings.update(id, {
            status: 'waiting_network',
            updatedAt: new Date().toISOString()
          })
          await refresh()
        }
      }
    }
  }

  const handleRecordClick = () => {
    if (!selectedType) return
    if (recorder.state === 'idle') {
      void recorder.start(selectedType)
    }
  }

  return (
    <section className="view">
      {/* 顶部栏 */}
      <header className="topbar">
        <div>
          <span className="eyebrow">VoiceNest</span>
          <h1>记录一个想法</h1>
        </div>
        <div className="topbar-actions">
          <ThemeToggle />
          <button className="icon-btn" onClick={() => navigate('/settings')} aria-label="设置">
            ⚙
          </button>
        </div>
      </header>

      {/* 分类选项行 */}
      <div className="type-row">
        {types.slice(0, 4).map((t) => (
          <button
            key={t.id}
            className={`chip ${selectedType?.id === t.id ? 'active' : ''}`}
            onClick={() => setSelectedType(t)}
          >
            {t.name}
          </button>
        ))}
        {types.length > 4 && (
          <button className="chip more" onClick={() => setShowMoreSheet(true)}>
            更多 ···
          </button>
        )}
      </div>

      {/* 录音大卡片 */}
      <div className="rec-card">
        <div className="prototype-badge">随记空间</div>
        <div className="rec-status">
          {recorder.state === 'recording' ? '正在录音' : recorder.state === 'paused' ? '已暂停' : '准备录音'}
        </div>
        <div className="timer">{formatElapsed(recorder.elapsedMs)}</div>
        
        <button
          className={`record-btn ${recorder.state === 'recording' ? 'recording' : ''}`}
          onClick={handleRecordClick}
          aria-label="录音主控"
        />

        {/* 暂停与完成控制行 */}
        <div className={`pause-row ${recorder.state !== 'idle' ? 'show' : ''}`}>
          {recorder.state === 'recording' && (
            <button className="ghost" onClick={recorder.pause}>暂停</button>
          )}
          {recorder.state === 'paused' && (
            <button className="ghost" onClick={recorder.resume}>继续</button>
          )}
          <button className="ghost" onClick={() => void complete()}>完成</button>
        </div>

        <div className="rec-hint">
          {recorder.state === 'idle' ? '点击开始录音' : '请保持页面前台'}
        </div>
      </div>

      {/* 最近录音板块 */}
      <div className="section-head" id="recentHead">
        <h2>最近录音</h2>
        <button onClick={() => navigate('/recordings')}>查看全部</button>
      </div>

      <div className="list" id="recentList">
        {recent.length ? (
          recent.map((recording) => (
            <RecordingCard
              highlighted={recording.id === highlightedId}
              key={recording.id}
              recording={recording}
              onRefresh={refresh}
            />
          ))
        ) : (
          <p className="empty-state">还没有本地录音，立即点击按钮录制一个吧！</p>
        )}
      </div>

      {/* 更多分类抽屉 */}
      <div className={`overlay ${showMoreSheet ? 'show' : ''}`} onClick={() => setShowMoreSheet(false)} />
      <div className={`sheet ${showMoreSheet ? 'show' : ''}`}>
        <div className="grab" />
        <div className="sheet-head">
          <h3>选择笔记类型</h3>
          <button className="icon-btn" onClick={() => setShowMoreSheet(false)}>×</button>
        </div>
        <div className="type-grid">
          {types.map((t) => (
            <button
              key={t.id}
              className="type-option"
              onClick={() => {
                setSelectedType(t)
                setShowMoreSheet(false)
              }}
            >
              <b>{t.name}</b>
              <small>{t.obsidianPath}</small>
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
