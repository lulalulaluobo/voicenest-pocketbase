import { useCallback, useEffect, useState } from 'react'
import type { Recording, RecordingStatus } from '../domain/recording'
import { RecordingCard } from '../components/RecordingCard'
import { listRecordings } from '../lib/recording-db'
import { getNoteTypes, type UserNoteType } from '../lib/config-store'

interface FilterOption {
  value: '' | RecordingStatus
  label: string
}

const statusFilters: FilterOption[] = [
  { value: '', label: '全部状态' },
  { value: 'ready', label: '待处理' },
  { value: 'waiting_network', label: '等待网络' },
  { value: 'processing', label: '处理中' },
  { value: 'synced', label: '已同步' },
  { value: 'failed', label: '失败' },
  { value: 'recovered', label: '已恢复' },
  { value: 'interrupted', label: '已中断' }
]

export function RecordingsPage() {
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [filterStatus, setFilterStatus] = useState<'' | RecordingStatus>('')
  const [filterType, setFilterType] = useState<string>('')
  const [noteTypes, setNoteTypes] = useState<UserNoteType[]>([])

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
    return matchStatus && matchType
  })

  return (
    <section className="page">
      <header className="topbar">
        <div>
          <span className="eyebrow">LIBRARY</span>
          <h1>音频列表</h1>
        </div>
      </header>

      {/* 标签过滤组 */}
      <div className="filters" aria-label="类型筛选" style={{ marginBottom: '12px' }}>
        <button
          className={filterType === '' ? 'selected' : ''}
          onClick={() => setFilterType('')}
          type="button"
        >
          全部标签
        </button>
        {noteTypes.map((type) => (
          <button
            className={filterType === type.id ? 'selected' : ''}
            key={type.id}
            onClick={() => setFilterType(type.id)}
            type="button"
          >
            {type.name}
          </button>
        ))}
      </div>

      {/* 状态过滤组 */}
      <div className="filters" aria-label="状态筛选" style={{ marginBottom: '6px' }}>
        {statusFilters.map((item) => (
          <button
            className={filterStatus === item.value ? 'selected' : ''}
            key={item.label}
            onClick={() => setFilterStatus(item.value)}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="recording-list">
        {visible.length ? (
          visible.map((recording) => (
            <RecordingCard key={recording.id} recording={recording} />
          ))
        ) : (
          <p className="empty-state">没有符合条件的本地录音。</p>
        )}
      </div>
    </section>
  )
}
