import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { Recording } from '../domain/recording'
import { StatusBadge } from '../components/StatusBadge'
import { deleteRecording, getChunks, getRecording, recordingDb, updateRecording } from '../lib/recording-db'
import { getRecordingAudioBlob } from '../lib/recording-audio'
import { getNoteTypes, type UserNoteType } from '../lib/config-store'
import { useProcessor } from '../hooks/use-processor'
import { ThemeToggle } from '../components/ThemeToggle'
import { getWechatStatusLabel } from '../lib/wechat'
import { buildPlaybackBlob } from '../lib/audio-playback'

function formatTime(secs: number) {
  if (isNaN(secs)) return '00:00'
  const m = String(Math.floor(secs / 60)).padStart(2, '0')
  const s = String(Math.floor(secs % 60)).padStart(2, '0')
  return `${m}:${s}`
}

export function RecordingDetailPage() {
  const { recordingId } = useParams<{ recordingId: string }>()
  const navigate = useNavigate()
  const [recording, setRecording] = useState<Recording | null | undefined>(undefined)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [noteTypes, setNoteTypes] = useState<UserNoteType[]>([])
  const [selectedTypeId, setSelectedTypeId] = useState('')
  
  // 编辑文本 State
  const [transcript, setTranscript] = useState('')
  const [summary, setSummary] = useState('')

  // 自定义播放器 State
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [audioDuration, setAudioDuration] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const { isProcessing, processRecording } = useProcessor()

  const refreshData = useCallback(async () => {
    if (!recordingId) return null
    const rec = await getRecording(recordingId)
    setRecording(rec ?? null)
    const types = getNoteTypes()
    setNoteTypes(types)
    if (rec) {
      setTranscript(rec.transcript || '')
      setSummary(rec.summary || '')
      setSelectedTypeId(rec.typeId)
    }
    return rec ?? null
  }, [recordingId])

  const handleTypeChange = async (val: string) => {
    setSelectedTypeId(val)
    if (recordingId && recording) {
      const targetType = noteTypes.find(t => t.id === val)
      if (targetType) {
        await updateRecording(recordingId, {
          typeId: val,
          typeName: targetType.name,
          updatedAt: new Date().toISOString()
        })
        await refreshData()
      }
    }
  }

  useEffect(() => {
    if (!recordingId) return
    let currentUrl: string | null = null
    
    void (async () => {
      const rec = await refreshData()
      if (!rec) return
      // 音频只存本地：无本地分片则不生成播放 URL（UI 显示「已清理」提示）
      const chunks = await getChunks(recordingId)
      if (!chunks.length) return
      currentUrl = URL.createObjectURL(buildPlaybackBlob(chunks, rec.mimeType))
      setAudioUrl(currentUrl)
    })()

    return () => {
      if (currentUrl) URL.revokeObjectURL(currentUrl)
    }
  }, [recordingId, refreshData])

  // 实时自动保存转写
  const handleTranscriptChange = async (val: string) => {
    setTranscript(val)
    if (recordingId) {
      await updateRecording(recordingId, {
        transcript: val,
        updatedAt: new Date().toISOString()
      })
    }
  }

  // 实时自动保存整理结果
  const handleSummaryChange = async (val: string) => {
    setSummary(val)
    if (recordingId) {
      await updateRecording(recordingId, {
        summary: val,
        updatedAt: new Date().toISOString()
      })
    }
  }

  const handleAction = async (mode: 'full' | 'sync_only') => {
    if (!recordingId) return
    if (mode === 'full' && !window.confirm('重新整理会再次调用转写和 AI，并覆盖当前个人笔记。确定继续吗？')) return
    await processRecording(recordingId, mode)
    await refreshData()
  }

  const remove = async () => {
    if (!recordingId || !window.confirm('删除本地录音及其音频分片？此操作无法撤销。')) return
    await deleteRecording(recordingId)
    navigate('/recordings')
  }

  // 自定义播放器控制
  const handlePlayPause = () => {
    if (recording?.isAudioCleared) {
      alert('音频已被本地到期策略自动清理，无法播放')
      return
    }
    if (!audioRef.current) return
    if (isPlaying) {
      audioRef.current.pause()
      setIsPlaying(false)
    } else {
      audioRef.current.play()
      setIsPlaying(true)
    }
  }

  const onAudioTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime)
    }
  }

  const onAudioLoadedMetadata = () => {
    if (audioRef.current) {
      setAudioDuration(audioRef.current.duration || 0)
    }
  }

  const onAudioEnded = () => {
    setIsPlaying(false)
    setCurrentTime(0)
  }

  const handleProgressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value)
    setCurrentTime(newTime)
    if (audioRef.current) {
      audioRef.current.currentTime = newTime
    }
  }

  if (recording === undefined) return <section className="view"><p className="empty-state">正在加载录音…</p></section>
  if (!recording) return <section className="view"><p className="empty-state">录音不存在或已删除。</p></section>

  const isWorking = isProcessing || recording.status === 'processing'
  const currentType = noteTypes.find(t => t.id === recording.typeId) || noteTypes[0]

  const duration = (audioDuration && isFinite(audioDuration))
    ? audioDuration
    : (recording.durationMs ? recording.durationMs / 1000 : 0)

  const progressPercent = duration ? (currentTime / duration) * 100 : 0

  return (
    <section className="view" style={{ paddingBottom: '112px' }}>
      {/* 隐藏的 HTML5 播放器引脚 */}
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          onTimeUpdate={onAudioTimeUpdate}
          onLoadedMetadata={onAudioLoadedMetadata}
          onEnded={onAudioEnded}
          style={{ display: 'none' }}
        />
      )}

      {/* 顶部导航 */}
      <header className="topbar">
        <div>
          <span className="eyebrow">Recording Detail</span>
          <h1>录音详情</h1>
        </div>
        <div className="topbar-actions">
          <ThemeToggle />
          <button className="icon-btn" onClick={() => navigate('/recordings')} aria-label="返回列表">
            ×
          </button>
        </div>
      </header>

      {/* 错误提示栏 */}
      {recording.errorMessage && (
        <div className="error-message" role="alert" style={{ marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <strong>⚠️ 整理遇到错误：</strong>
          <span style={{ fontSize: '13px', opacity: 0.9 }}>{recording.errorMessage}</span>
        </div>
      )}

      {/* 录音主属性卡片 */}
      <div className="detail-card" style={{ display: 'grid', gap: '16px' }}>
        <div className="detail-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>{recording.localTitle}</h2>
          <StatusBadge status={recording.status} />
        </div>
        
        <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: '88px 1fr', gap: '10px', fontSize: '13px' }}>
          <dt style={{ color: 'var(--muted)', fontWeight: 'bold' }}>录音时间</dt>
          <dd style={{ margin: 0 }}>{new Date(recording.createdAt).toLocaleString('zh-CN')}</dd>
          <dt style={{ color: 'var(--muted)', fontWeight: 'bold' }}>笔记分类</dt>
          <dd style={{ margin: 0 }}>{recording.typeName}</dd>
          <dt style={{ color: 'var(--muted)', fontWeight: 'bold' }}>音频格式</dt>
          <dd style={{ margin: 0 }}>{recording.mimeType}</dd>
        </dl>

        {/* 拟物高档自定义播放器 */}
        {recording.isAudioCleared ? (
          <div style={{ padding: '12px', background: 'var(--warnBg)', border: '1px solid var(--line)', borderRadius: '12px', color: 'var(--warn)', fontSize: '13px', display: 'flex', gap: '6px' }}>
            <span>ℹ️</span> 本条录音的音频分片已触发本地自动保留策略被清理，已安全保留其文字记录。
          </div>
        ) : audioUrl ? (
          <div className="player" style={{ marginTop: '10px' }}>
            <button className="play-circle" onClick={handlePlayPause}>
              {isPlaying ? '⏸' : '▶'}
            </button>
            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.1}
              value={currentTime}
              onChange={handleProgressChange}
              className="progress-slider"
              style={{
                '--progress': `${progressPercent}%`
              } as React.CSSProperties}
            />
            <span className="meta" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>
        ) : (
          <p className="empty-state" style={{ padding: '12px' }}>音频文件尚未就绪。</p>
        )}
      </div>

      {/* 同步路径信息卡片 */}
      <div className="detail-card">
        <h3>同步信息</h3>
        <div className="row">
          <div className="row-main">
            <div className="row-title">Obsidian 路径</div>
            <div className="row-sub">{currentType?.obsidianPath || '未指定路径'}</div>
          </div>
          <div style={{ color: 'var(--muted)' }}>›</div>
        </div>
        <div className="row">
          <div className="row-main">
            <div className="row-title">文件名</div>
            <div className="row-sub">{recording.localTitle}.md</div>
          </div>
          <div style={{ color: 'var(--muted)' }}>›</div>
        </div>
        <div className="row">
          <div className="row-main">
            <div className="row-title">当前状态</div>
            <div className="row-sub">
              {recording.status === 'synced' ? '已同步 · 可重新同步或整理' : '未同步 · 待激活上传'}
            </div>
          </div>
          {recording.status === 'synced' ? (
            <div className="status ok">已同步</div>
          ) : (
            <div className="status wait">待处理</div>
          )}
        </div>
        <div className="row">
          <div className="row-main">
            <div className="row-title">公众号草稿</div>
            <div className="row-sub">{getWechatStatusLabel(recording.wechatStatus) || '尚未创建草稿'}</div>
          </div>
          <div className={`status ${recording.wechatStatus === 'drafted' ? 'ok' : recording.wechatStatus === 'failed' || recording.wechatStatus === 'authorization_required' ? 'wait' : ''}`}>
            {recording.wechatStatus === 'drafted' ? '已入草稿' : recording.wechatStatus === 'failed' ? '失败' : recording.wechatStatus === 'authorization_required' ? '待授权' : '未同步'}
          </div>
        </div>
      </div>

      {/* 原始转写文本域 */}
      <div className="detail-card">
        <h3>原始转写</h3>
        <textarea
          value={transcript}
          onChange={(e) => handleTranscriptChange(e.target.value)}
          disabled={isWorking}
          placeholder="等待 ASR 转写或手动编辑录入..."
        />
      </div>

      {/* 整理后的 Markdown 文本域 */}
      <div className="detail-card">
        <h3>整理后的 Markdown</h3>
        <textarea
          value={summary}
          onChange={(e) => handleSummaryChange(e.target.value)}
          disabled={isWorking}
          placeholder="等待 LLM 整理或手动编辑..."
          style={{ fontFamily: 'monospace', fontSize: '13px', minHeight: '220px' }}
        />
      </div>

      {/* 整理选项设置 */}
      <div className="detail-card" style={{ display: 'grid', gap: '16px' }}>
        <div className="row" style={{ borderTop: 0, padding: '4px 0', cursor: 'default' }}>
          <div className="row-main">
            <div className="row-title">重新整理分类</div>
            <div className="row-sub">切换分类以使用不同的提示词模版整理</div>
          </div>
          <select
            value={selectedTypeId}
            onChange={(e) => void handleTypeChange(e.target.value)}
            disabled={isWorking}
            style={{
              padding: '8px 12px',
              borderRadius: '12px',
              border: '1px solid var(--line)',
              background: 'var(--card)',
              color: 'var(--text)',
              fontSize: '13px',
              fontWeight: '600',
              outline: 'none',
              cursor: isWorking ? 'not-allowed' : 'pointer'
            }}
          >
            {noteTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 动作按钮行 */}
      <div className="detail-card" style={{ background: 'transparent', border: 0, padding: 0 }}>
        <div className="btn-row">
          <button
            className="wide-btn"
            onClick={() => handleAction('full')}
            disabled={isWorking || !!recording.isAudioCleared}
            style={{ opacity: (isWorking || !!recording.isAudioCleared) ? 0.6 : 1 }}
          >
            {isWorking ? '重新整理中...' : '重新整理生成'}
          </button>
          
          <button
            className="wide-btn primary"
            onClick={() => handleAction('sync_only')}
            disabled={isWorking || !summary}
            style={{ opacity: (isWorking || !summary) ? 0.6 : 1 }}
          >
            重新同步
          </button>
        </div>

        <button 
          className="wide-btn danger" 
          onClick={() => void remove()} 
          style={{ 
            marginTop: '12px', 
            width: '100%', 
            background: 'var(--dangerBg)', 
            color: 'var(--danger)', 
            borderColor: 'var(--line)', 
            border: '1px solid var(--line)' 
          }}
        >
          🗑 删除本地音频与全部缓存
        </button>
      </div>
    </section>
  )
}
