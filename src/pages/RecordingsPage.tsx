import { useCallback, useEffect, useState } from 'react'
import type { Recording, RecordingStatus } from '../domain/recording'
import { RecordingCard } from '../components/RecordingCard'
import { listRecordings } from '../lib/recording-db'
import { getNoteTypes, type UserNoteType } from '../lib/config-store'
import { ThemeToggle } from '../components/ThemeToggle'

interface FilterOption {
  value: '' | RecordingStatus
  label: string
}

const statusFilters: FilterOption[] = [
  { value: '', label: '全部' },
  { value: 'ready', label: '待处理' },
  { value: 'waiting_network', label: '等待网络' },
  { value: 'processing', label: '处理中' },
  { value: 'synced', label: '已同步' },
  { value: 'failed', label: '失败' }
]

export function RecordingsPage() {
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [filterStatus, setFilterStatus] = useState<'' | RecordingStatus>('')
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
    const matchStatus = !filterStatus || recording.status === filterStatus
    const matchType = !filterType || recording.typeId === filterType
    const matchQuery = !searchQuery.trim() || 
      recording.localTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (recording.transcript && recording.transcript.toLowerCase().includes(searchQuery.toLowerCase()))
    return matchStatus && matchType && matchQuery
  })

  return (
    <section className="view">
      {/* 顶部栏 */}
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

      {/* 搜索框 */}
      {showSearch && (
        <div style={{ marginBottom: '14px' }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索录音标题或转写内容..."
            style={{ 
              width: '100%', 
              minHeight: '44px', 
              padding: '0 12px', 
              borderRadius: '12px', 
              border: '1px solid var(--line)',
              background: 'var(--card2)',
              color: 'var(--text)'
            }}
          />
        </div>
      )}

      {/* 分类标签筛选行 */}
      <div className="type-row" style={{ marginBottom: '10px' }}>
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

      {/* 状态过滤行 */}
      <div className="type-row" style={{ marginBottom: '18px' }}>
        {statusFilters.map((item) => (
          <button
            key={item.label}
            className={`chip ${filterStatus === item.value ? 'active' : ''}`}
            onClick={() => setFilterStatus(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* 核心列表容器 */}
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
