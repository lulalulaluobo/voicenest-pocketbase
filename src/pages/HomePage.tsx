import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRecorder } from '../hooks/use-recorder'
import { recordingDb, updateRecording } from '../lib/recording-db'
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
  
  // 底部抽屉与遮罩
  const [showMoreSheet, setShowMoreSheet] = useState(false)

  const { processRecording } = useProcessor()

  useEffect(() => {
    const noteTypes = getNoteTypes()
    setTypes(noteTypes)
    setSelectedType((selected) => {
      if (selected || !noteTypes.length) return selected
      const def = noteTypes.find((t) => t.isDefault) || noteTypes[0]
      return def
    })
  }, [])

  const complete = async () => {
    if (!selectedType) return
    const id = await recorder.stop()
    if (id) {
      const autoProcess = localStorage.getItem('vn_auto_process') === 'true'
      if (autoProcess) {
        if (navigator.onLine) {
          void processRecording(id, 'full')
        } else {
          await updateRecording(id, {
            status: 'waiting_network',
            updatedAt: new Date().toISOString()
          })
        }
      }
    }
  }

  const handleRecordClick = () => {
    if (!selectedType) return
    if (recorder.state === 'idle') {
      void recorder.start(selectedType)
    } else if (recorder.state === 'recording') {
      recorder.pause()
    } else {
      recorder.resume()
    }
  }

  const cancel = () => {
    if (window.confirm('取消本次录音？已录制的内容将不会保存。')) void recorder.cancel()
  }

  return (
    <section className="view home-view">
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
          className={`record-btn ${recorder.state === 'recording' ? 'recording' : ''} ${recorder.state === 'paused' ? 'paused' : ''}`}
          onClick={handleRecordClick}
          aria-label={recorder.state === 'recording' ? '暂停录音' : recorder.state === 'paused' ? '继续录音' : '开始录音'}
        />

        <div className="rec-hint">
          {recorder.state === 'idle' ? '点击开始录音' : recorder.state === 'paused' ? '点击继续录音' : '点击暂停录音'}
        </div>
      </div>

      {/* 结束与取消控制行 */}
      <div className={`pause-row ${recorder.state !== 'idle' ? 'show' : ''}`}>
        <button className="ghost" onClick={() => void complete()}>结束</button>
        <button className="ghost danger" onClick={cancel}>取消</button>
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
