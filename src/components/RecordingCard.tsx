import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Recording } from '../domain/recording'
import { StatusBadge } from './StatusBadge'
import { deleteRecording, getChunks } from '../lib/recording-db'
import { getAudioDownloadFilename } from '../lib/audio-mime'
import { getRecordingAudioBlob } from '../lib/recording-audio'
import { downloadBlob } from '../lib/file-download'
import { useProcessor } from '../hooks/use-processor'
import { getWechatStatusLabel } from '../lib/wechat'
import { getWechatDraftConfig } from '../lib/config-store'

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
      const url = URL.createObjectURL(await getRecordingAudioBlob(recording, chunks.map((chunk) => chunk.blob)))
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
    if (recording.status === 'synced' && !window.confirm('重新整理会再次调用转写和 AI，并覆盖当前个人笔记。确定继续吗？')) return
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

  const canDownload = !recording.isAudioCleared
  const downloadLabel = recording.isAudioCleared ? '音频已清理' : '下载音频'
  const wechatConfig = getWechatDraftConfig()
  const canEditWechat = Boolean(recording.summary) && wechatConfig.enabled && Boolean(wechatConfig.workerUrl.trim())
  const wechatLabel = canEditWechat ? '改写公众号文章' : '请先在设置启用公众号编辑并填写服务地址'

  const handleDownloadClick = async (e: React.MouseEvent) => {
    e.stopPropagation()
    const chunks = await getChunks(recording.id)
    if (!chunks.length) {
      alert('没有可下载的音频分片')
      return
    }

    try {
      const destination = await downloadBlob(
        await getRecordingAudioBlob(recording, chunks.map((chunk) => chunk.blob)),
        getAudioDownloadFilename(recording.localTitle, recording.mimeType),
      )
      alert(destination === 'native' ? '音频已保存至 下载/声笺' : '音频已开始下载')
    } catch (error) {
      alert(`音频下载失败：${error instanceof Error ? error.message : '未知错误'}`)
    }
  }

  const isWorking = isProcessing || recording.status === 'processing'

  return (
    <div className={`item ${highlighted ? 'flash' : ''}`} id={`recording-${recording.id}`} style={{ position: 'relative' }}>
      <div
        className="item-top item-summary"
        role="button"
        tabIndex={0}
        aria-label="查看录音详情"
        onClick={() => navigate(`/recordings/${recording.id}`)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            navigate(`/recordings/${recording.id}`)
          }
        }}
      >
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
          {getWechatStatusLabel(recording.wechatStatus) && (
            <div style={{ color: recording.wechatStatus === 'failed' || recording.wechatStatus === 'authorization_required' ? 'var(--danger)' : 'var(--muted)', fontSize: '11px', marginTop: '4px' }}>
              {getWechatStatusLabel(recording.wechatStatus)}
            </div>
          )}
        </div>
        <StatusBadge status={recording.status} />
      </div>

      <div className="actions">
        {recording.status === 'synced' ? (
          <>
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
          className="action download-btn"
          onClick={handleDownloadClick}
          disabled={!canDownload}
          aria-label={canDownload ? '下载音频' : downloadLabel}
        >
          ⇩
        </button>

        {recording.summary && (
          <button
            className="action wechat-btn"
            onClick={(e) => { e.stopPropagation(); navigate(`/recordings/${recording.id}/wechat`) }}
            disabled={!canEditWechat}
            aria-label={wechatLabel}
            title={wechatLabel}
          >
            💬
          </button>
        )}

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
