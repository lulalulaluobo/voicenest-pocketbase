import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { Recording } from '../domain/recording'
import { StatusBadge } from '../components/StatusBadge'
import { deleteRecording, getChunks, getRecording, recordingDb } from '../lib/recording-db'
import { useProcessor } from '../hooks/use-processor'

export function RecordingDetailPage() {
  const { recordingId } = useParams<{ recordingId: string }>()
  const navigate = useNavigate()
  const [recording, setRecording] = useState<Recording | null | undefined>(undefined)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  
  // 编辑文本 State
  const [transcript, setTranscript] = useState('')
  const [summary, setSummary] = useState('')

  const { isProcessing, processRecording } = useProcessor()

  const refreshData = useCallback(async () => {
    if (!recordingId) return
    const rec = await getRecording(recordingId)
    setRecording(rec ?? null)
    if (rec) {
      setTranscript(rec.transcript || '')
      setSummary(rec.summary || '')
    }
  }, [recordingId])

  useEffect(() => {
    if (!recordingId) return
    let currentUrl: string | null = null
    
    void (async () => {
      await refreshData()
      const chunks = await getChunks(recordingId)
      if (!chunks.length) return
      currentUrl = URL.createObjectURL(new Blob(chunks.map((chunk) => chunk.blob), { type: 'audio/webm' }))
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
      await recordingDb.recordings.update(recordingId, {
        transcript: val,
        updatedAt: new Date().toISOString()
      })
    }
  }

  // 实时自动保存整理结果
  const handleSummaryChange = async (val: string) => {
    setSummary(val)
    if (recordingId) {
      await recordingDb.recordings.update(recordingId, {
        summary: val,
        updatedAt: new Date().toISOString()
      })
    }
  }

  const handleAction = async (mode: 'full' | 'sync_only') => {
    if (!recordingId) return
    await processRecording(recordingId, mode)
    await refreshData()
  }

  const remove = async () => {
    if (!recordingId || !window.confirm('删除本地录音及其音频分片？此操作无法撤销。')) return
    await deleteRecording(recordingId)
    navigate('/recordings')
  }

  if (recording === undefined) return <section className="page"><p className="empty-state">正在加载录音…</p></section>
  if (!recording) return <section className="page"><p className="empty-state">录音不存在或已删除。</p></section>

  const isWorking = isProcessing || recording.status === 'processing'

  return (
    <section className="page detail-page" style={{ paddingBottom: '100px' }}>
      <header className="topbar">
        <div>
          <span className="eyebrow">RECORDING DETAIL</span>
          <h1>录音详情</h1>
        </div>
        <button className="icon-button" onClick={() => navigate('/recordings')} type="button" aria-label="返回列表">×</button>
      </header>

      {/* 错误提示栏 */}
      {recording.errorMessage && (
        <div className="error-message" role="alert" style={{ marginBottom: '16px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
          <strong>⚠️ 处理遇到错误：</strong>
          <span style={{ fontSize: '13px', opacity: 0.9 }}>{recording.errorMessage}</span>
        </div>
      )}

      <article className="detail-card" style={{ display: 'grid', gap: '16px' }}>
        <div className="detail-title">
          <h2>{recording.localTitle}</h2>
          <StatusBadge status={recording.status} />
        </div>
        <dl>
          <dt>录音时间</dt>
          <dd>{new Date(recording.createdAt).toLocaleString('zh-CN')}</dd>
          <dt>笔记类型</dt>
          <dd>{recording.typeName}</dd>
          <dt>音频格式</dt>
          <dd>{recording.mimeType}</dd>
        </dl>

        {audioUrl ? (
          <audio controls preload="metadata" src={audioUrl} style={{ width: '100%' }}>
            当前浏览器无法播放这段音频。
          </audio>
        ) : (
          <p className="empty-state">这条录音没有可播放的音频分片。</p>
        )}
      </article>

      {/* API 管道流操作控制板 */}
      <section className="settings-card" style={{ marginTop: '16px' }}>
        <h2>语音整理管线操作</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '10px' }}>
          {recording.status !== 'synced' ? (
            <button
              className="btn"
              disabled={isWorking}
              onClick={() => handleAction('full')}
              style={{
                minHeight: '44px',
                background: '#bf3b3b',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 'bold',
                opacity: isWorking ? 0.6 : 1
              }}
              type="button"
            >
              {isWorking ? '处理中...' : '上传并整理 (ASR+LLM)'}
            </button>
          ) : (
            <button
              className="btn"
              disabled={isWorking}
              onClick={() => handleAction('full')}
              style={{
                minHeight: '44px',
                background: '#5b5148',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 'bold',
                opacity: isWorking ? 0.6 : 1
              }}
              type="button"
            >
              {isWorking ? '处理中...' : '重新整理生成'}
            </button>
          )}

          <button
            className="btn"
            disabled={isWorking || !summary}
            onClick={() => handleAction('sync_only')}
            style={{
              minHeight: '44px',
              background: '#315d92',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 'bold',
              opacity: (isWorking || !summary) ? 0.6 : 1
            }}
            type="button"
          >
            仅同步到 Obsidian
          </button>
        </div>
      </section>

      {/* 文本域可编辑编辑区域 */}
      <section className="settings-card" style={{ marginTop: '16px', display: 'grid', gap: '16px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '13px', fontWeight: 'bold', color: '#81766c' }}>原始转写文本 (ASR)</label>
          <textarea
            value={transcript}
            onChange={(e) => handleTranscriptChange(e.target.value)}
            disabled={isWorking}
            placeholder="等待 ASR 转写或手动录入..."
            style={{
              minHeight: '120px',
              padding: '10px',
              borderRadius: '8px',
              border: '1px solid #ded6cb',
              fontSize: '14px',
              fontFamily: 'inherit',
              lineHeight: '1.5',
              background: isWorking ? '#f5f2ec' : '#fff',
              color: '#27241f'
            }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '13px', fontWeight: 'bold', color: '#81766c' }}>整理后的 Markdown 笔记 (LLM)</label>
          <textarea
            value={summary}
            onChange={(e) => handleSummaryChange(e.target.value)}
            disabled={isWorking}
            placeholder="等待 LLM 整理或手动编辑..."
            style={{
              minHeight: '180px',
              padding: '10px',
              borderRadius: '8px',
              border: '1px solid #ded6cb',
              fontSize: '13px',
              fontFamily: 'monospace',
              lineHeight: '1.5',
              background: isWorking ? '#f5f2ec' : '#fff',
              color: '#27241f'
            }}
          />
        </div>
      </section>

      <button className="danger-button" onClick={() => void remove()} type="button" style={{ marginTop: '24px' }}>
        删除本地音频与所有相关缓存
      </button>
    </section>
  )
}
