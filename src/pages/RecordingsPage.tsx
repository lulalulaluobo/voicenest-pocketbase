import { useCallback, useEffect, useState } from 'react'
import type { Recording, RecordingStatus } from '../domain/recording'
import { RecordingCard } from '../components/RecordingCard'
import { listRecordings } from '../lib/recording-db'

const filters: Array<{ value: '' | RecordingStatus; label: string }> = [
  { value: '', label: '全部' },
  { value: 'ready', label: '待处理' },
  { value: 'recovered', label: '已恢复' },
  { value: 'interrupted', label: '已中断' },
]

export function RecordingsPage() {
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [filter, setFilter] = useState<'' | RecordingStatus>('')
  const refresh = useCallback(async () => setRecordings(await listRecordings()), [])

  useEffect(() => { void refresh() }, [refresh])
  const visible = filter ? recordings.filter((recording) => recording.status === filter) : recordings

  return (
    <section className="page">
      <header className="topbar"><div><span className="eyebrow">LIBRARY</span><h1>音频列表</h1></div></header>
      <div className="filters" aria-label="状态筛选">
        {filters.map((item) => <button className={filter === item.value ? 'selected' : ''} key={item.label} onClick={() => setFilter(item.value)} type="button">{item.label}</button>)}
      </div>
      <div className="recording-list">{visible.length ? visible.map((recording) => <RecordingCard key={recording.id} recording={recording} />) : <p className="empty-state">没有符合条件的本地录音。</p>}</div>
    </section>
  )
}
