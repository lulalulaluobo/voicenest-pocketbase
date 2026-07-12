import { Link } from 'react-router-dom'
import type { Recording } from '../domain/recording'
import { StatusBadge } from './StatusBadge'

function formatDuration(durationMs: number) {
  const seconds = Math.floor(durationMs / 1000)
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

export function RecordingCard({ recording, highlighted = false }: { recording: Recording; highlighted?: boolean }) {
  return (
    <Link
      className="recording-card"
      data-highlighted={highlighted || undefined}
      id={`recording-${recording.id}`}
      to={`/recordings/${recording.id}`}
    >
      <div>
        <strong>{recording.localTitle}</strong>
        <small>{new Date(recording.createdAt).toLocaleString('zh-CN')} · {recording.typeName} · {formatDuration(recording.durationMs)}</small>
      </div>
      <StatusBadge status={recording.status} />
    </Link>
  )
}
