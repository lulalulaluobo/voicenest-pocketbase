import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { Recording } from '../domain/recording'
import { StatusBadge } from '../components/StatusBadge'
import { deleteRecording, getChunks, getRecording } from '../lib/recording-db'

export function RecordingDetailPage() {
  const { recordingId } = useParams()
  const navigate = useNavigate()
  const [recording, setRecording] = useState<Recording | null | undefined>(undefined)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!recordingId) return
    let currentUrl: string | null = null
    void (async () => {
      const nextRecording = await getRecording(recordingId)
      setRecording(nextRecording ?? null)
      if (!nextRecording) return
      const chunks = await getChunks(recordingId)
      if (!chunks.length) return
      currentUrl = URL.createObjectURL(new Blob(chunks.map((chunk) => chunk.blob), { type: nextRecording.mimeType }))
      setAudioUrl(currentUrl)
    })()
    return () => {
      if (currentUrl) URL.revokeObjectURL(currentUrl)
    }
  }, [recordingId])

  const remove = async () => {
    if (!recordingId || !window.confirm('删除本地录音及其音频分片？此操作无法撤销。')) return
    await deleteRecording(recordingId)
    navigate('/recordings')
  }

  if (recording === undefined) return <section className="page"><p className="empty-state">正在加载录音…</p></section>
  if (!recording) return <section className="page"><p className="empty-state">录音不存在或已删除。</p></section>

  return (
    <section className="page detail-page">
      <header className="topbar"><div><span className="eyebrow">RECORDING DETAIL</span><h1>录音详情</h1></div><button className="icon-button" onClick={() => navigate('/recordings')} type="button" aria-label="返回列表">×</button></header>
      <article className="detail-card">
        <div className="detail-title"><h2>{recording.localTitle}</h2><StatusBadge status={recording.status} /></div>
        <dl><dt>录音时间</dt><dd>{new Date(recording.createdAt).toLocaleString('zh-CN')}</dd><dt>笔记类型</dt><dd>{recording.typeName}</dd><dt>音频格式</dt><dd>{recording.mimeType}</dd></dl>
        {audioUrl ? <audio controls preload="metadata" src={audioUrl}>当前浏览器无法播放这段音频。</audio> : <p className="empty-state">这条录音没有可播放的音频分片。</p>}
      </article>
      <button className="danger-button" onClick={() => void remove()} type="button">删除本地录音</button>
    </section>
  )
}
