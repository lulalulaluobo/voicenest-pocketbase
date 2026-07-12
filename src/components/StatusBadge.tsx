import type { RecordingStatus } from '../domain/recording'

const labels: Record<RecordingStatus, string> = {
  recording: '录音中',
  ready: '待处理',
  recovered: '已恢复',
  interrupted: '已中断',
  waiting_network: '等待网络',
  processing: '处理中',
  synced: '已同步',
  failed: '失败',
}

export function StatusBadge({ status }: { status: RecordingStatus }) {
  return <span className={`status status-${status}`}>{labels[status]}</span>
}
