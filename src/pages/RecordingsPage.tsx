import { useCallback, useEffect, useState } from 'react'
import type { Recording } from '../domain/recording'
import { RecordingCard } from '../components/RecordingCard'
import { listRecordings } from '../lib/recording-db'
import { getNoteTypes, type UserNoteType } from '../lib/config-store'
import { ThemeToggle } from '../components/ThemeToggle'

export function RecordingsPage() {
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [filterType, setFilterType] = useState<string>('')
  const [noteTypes, setNoteTypes] = useState<UserNoteType[]>([])
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const refresh = useCallback(async () => {
    setRecordings(await listRecordings())
    setNoteTypes(getNoteTypes())
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const visible = recordings.filter((recording) => {
    const matchType = !filterType || recording.typeId === filterType
    const matchQuery = !searchQuery.trim() || 
      recording.localTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (recording.transcript && recording.transcript.toLowerCase().includes(searchQuery.toLowerCase()))
    return matchType && matchQuery
  })

  return (
    <section className="view">
      <div className="recordings-sticky-header">
        <header className="topbar">
          <div>
            <span className="eyebrow">Library</span>
            <h1>音频列表</h1>
          </div>
          <div className="topbar-actions">
            <ThemeToggle />
            <button
              className="icon-btn"
              onClick={() => setShowSearch(!showSearch)}
              style={{ background: showSearch ? 'var(--soft)' : 'var(--card)' }}
              aria-label="搜索"
            >
              ⌕
            </button>
          </div>
        </header>

        {showSearch && (
          <div className="recordings-search">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索录音标题或转写内容..."
            />
          </div>
        )}

        <div className="type-row">
          <button
            className={`chip ${filterType === '' ? 'active' : ''}`}
            onClick={() => setFilterType('')}
          >
            所有标签
          </button>
          {noteTypes.map((type) => (
            <button
              key={type.id}
              className={`chip ${filterType === type.id ? 'active' : ''}`}
              onClick={() => setFilterType(type.id)}
            >
              {type.name}
            </button>
          ))}
        </div>
      </div>

      <div className="list">
        {visible.length ? (
          visible.map((recording) => (
            <RecordingCard 
              key={recording.id} 
              recording={recording} 
              onRefresh={refresh}
            />
          ))
        ) : (
          <p className="empty-state">没有符合筛选条件的录音。</p>
        )}
      </div>
    </section>
  )
}
