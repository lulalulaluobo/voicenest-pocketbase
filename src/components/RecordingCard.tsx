import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Recording } from '../domain/recording'
import { StatusBadge } from './StatusBadge'
import { deleteRecording, getChunks } from '../lib/recording-db'
import { getAudioDownloadFilename } from '../lib/audio-mime'
import { useProcessor } from '../hooks/use-processor'

function formatDuration(durationMs: number) {
  const seconds = Math.floor(durationMs / 1000)
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

interface RecordingCardProps {
  recording: Recording
  highlighted?: boolean
  onRefresh?: () => void
}

export function RecordingCard({ recording, highlighted = false, onRefresh }: RecordingCardProps) {
  const navigate = useNavigate()
  const [isPlaying, setIsPlaying] = useState(false)
  const [audioObj, setAudioObj] = useState<HTMLAudioElement | null>(null)
  const [showMenu, setShowMenu] = useState(false)
  const { isProcessing, processRecording } = useProcessor()

  // 自动释放音频源
  useEffect(() => {
    return () => {
      if (audioObj) {
        audioObj.pause()
        URL.revokeObjectURL(audioObj.src)
      }
    }
  }, [audioObj])

  const handlePlayToggle = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (recording.isAudioCleared) {
      alert('音频已被本地到期自动保留策略清理，无法播放')
      return
    }

    if (audioObj) {
      if (isPlaying) {
        audioObj.pause()
        setIsPlaying(false)
      } else {
        audioObj.play()
        setIsPlaying(true)
      }
    } else {
      const chunks = await getChunks(recording.id)
      if (!chunks.length) {
        alert('没有可播放的音频分片')
        return
      }
      const url = URL.createObjectURL(new Blob(chunks.map(c => c.blob), { type: 'audio/webm' }))
      const audio = new Audio(url)
      audio.onended = () => setIsPlaying(false)
      audio.onerror = () => {
        setIsPlaying(false)
        alert('音频播放失败，请重试')
      }
      setAudioObj(audio)
      audio.play()
      setIsPlaying(true)
    }
  }

  const handleProcessClick = async (e: React.MouseEvent) => {
    e.stopPropagation()
    await processRecording(recording.id, 'full')
    if (onRefresh) onRefresh()
  }

  const handleResyncClick = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setShowMenu(false)
    await processRecording(recording.id, 'sync_only')
    if (onRefresh) onRefresh()
  }

  const handleDeleteClick = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setShowMenu(false)
    const isSynced = recording.status === 'synced'
    const confirmMsg = isSynced 
      ? '确定删除该本地录音吗？' 
      : '⚠️ 该录音尚未同步完成，确定强行删除吗？'
    if (window.confirm(confirmMsg)) {
      await deleteRecording(recording.id)
      if (onRefresh) onRefresh()
    }
  }

  const canDownload = Boolean(recording.summary) && !recording.isAudioCleared
  const downloadLabel = recording.isAudioCleared ? '音频已清理' : recording.summary ? '⇩ 下载' : '整理后下载'

  const handleDownloadClick = async (e: React.MouseEvent) => {
    e.stopPropagation()
    const chunks = await getChunks(recording.id)
    if (!chunks.length) {
      alert('没有可下载的音频分片')
      return
    }

    const url = URL.createObjectURL(new Blob(chunks.map((chunk) => chunk.blob), { type: recording.mimeType }))
    const link = document.createElement('a')
    link.href = url
    link.download = getAudioDownloadFilename(recording.localTitle, recording.mimeType)
    document.body.append(link)
    link.click()
    link.remove()
    // ponytail: iOS Safari 可能改为打开分享页；跨平台保存目录需更复杂的原生文件 API。
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  const isWorking = isProcessing || recording.status === 'processing'

  return (
    <div
      className={`item ${highlighted ? 'flash' : ''}`}
      onClick={() => navigate(`/recordings/${recording.id}`)}
      id={`recording-${recording.id}`}
      style={{ position: 'relative' }}
    >
      <div className="item-top">
        <div>
          <div className="item-title">{recording.localTitle}</div>
          <div className="meta">
            {formatDuration(recording.durationMs)} · {recording.typeName} · {new Date(recording.createdAt).toLocaleString('zh-CN')}
          </div>
          {recording.errorMessage && (
            <div style={{ color: 'var(--danger)', fontSize: '11px', marginTop: '4px', fontWeight: 'bold' }}>
              ⚠️ {recording.errorMessage}
            </div>
          )}
        </div>
        <StatusBadge status={recording.status} />
      </div>

      <div className="actions">
        {recording.status === 'synced' ? (
          <>
            <button className="action" onClick={(e) => { e.stopPropagation(); navigate(`/recordings/${recording.id}`) }}>
              查看详情
            </button>
            <button className="action" onClick={handleProcessClick} disabled={isWorking || !!recording.isAudioCleared}>
              重新整理
            </button>
          </>
        ) : (
          <>
            <button className="action" onClick={handlePlayToggle} disabled={!!recording.isAudioCleared}>
              {isPlaying ? '⏸ 暂停' : '▶ 播放'}
            </button>
            <button className="action primary" onClick={handleProcessClick} disabled={isWorking}>
              {recording.status === 'waiting_network' ? '立即处理' : '上传并整理'}
            </button>
          </>
        )}

        <button
          className="action"
          onClick={handleDownloadClick}
          disabled={!canDownload}
          aria-label={canDownload ? '下载音频' : downloadLabel}
        >
          {downloadLabel}
        </button>

        <button 
          className="action more-btn" 
          onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu) }}
        >
          ···
        </button>
      </div>

      {showMenu && (
        <>
          <div 
            style={{ position: 'fixed', inset: 0, zIndex: 65 }} 
            onClick={(e) => { e.stopPropagation(); setShowMenu(false) }} 
          />
          <div 
            className="menu show" 
            style={{ 
              position: 'absolute', 
              right: '14px', 
              bottom: '50px', 
              zIndex: 70,
              display: 'block' 
            }}
          >
            <button onClick={(e) => { e.stopPropagation(); navigate(`/recordings/${recording.id}`) }}>
              查看详情
            </button>
            <button onClick={handleResyncClick} disabled={!recording.summary}>
              重新同步
            </button>
            <button className="danger" onClick={handleDeleteClick}>
              删除本地录音
            </button>
          </div>
        </>
      )}
    </div>
  )
}
