import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { Recording } from '../domain/recording'
import {
  getLLMConfig,
  getWechatDraftConfig,
  getWechatPromptTemplates,
  saveWechatPromptTemplates,
  type WechatPromptTemplate
} from '../lib/config-store'
import { getRecording, recordingDb } from '../lib/recording-db'
import { rewriteWechatArticle } from '../lib/llm'
import { publishWechatDraft, WechatDraftError } from '../lib/wechat'
import { ThemeToggle } from '../components/ThemeToggle'

export function WechatEditorPage() {
  const { recordingId } = useParams<{ recordingId: string }>()
  const navigate = useNavigate()
  const [recording, setRecording] = useState<Recording | null | undefined>(undefined)
  const [templates, setTemplates] = useState<WechatPromptTemplate[]>([])
  const [templateId, setTemplateId] = useState('')
  const [prompt, setPrompt] = useState('')
  const [title, setTitle] = useState('')
  const [markdown, setMarkdown] = useState('')
  const [isRewriting, setIsRewriting] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!recordingId) return
    void (async () => {
      const rec = await getRecording(recordingId)
      const savedTemplates = getWechatPromptTemplates()
      setRecording(rec ?? null)
      setTemplates(savedTemplates)
      setTemplateId(savedTemplates[0]?.id || '')
      setPrompt(savedTemplates[0]?.prompt || '')
      setTitle(rec?.wechatTitle || '')
      setMarkdown(rec?.wechatMarkdown || '')
    })()
  }, [recordingId])

  const saveArticleField = (changes: Partial<Recording>) => {
    if (!recording) return
    const updated = { ...recording, ...changes, updatedAt: new Date().toISOString() }
    setRecording(updated)
    void recordingDb.recordings.update(recording.id, changes)
  }

  const handleTemplateChange = (nextId: string) => {
    const template = templates.find((item) => item.id === nextId)
    setTemplateId(nextId)
    setPrompt(template?.prompt || '')
  }

  const savePrompt = () => {
    const nextTemplates = templates.map((template) => (
      template.id === templateId ? { ...template, prompt } : template
    ))
    setTemplates(nextTemplates)
    saveWechatPromptTemplates(nextTemplates)
  }

  const handleRewrite = async () => {
    if (!recording?.summary || !prompt.trim()) return
    setIsRewriting(true)
    setMessage('')
    try {
      const article = await rewriteWechatArticle(recording.summary, prompt.trim(), getLLMConfig())
      setTitle(article.title)
      setMarkdown(article.markdown)
      saveArticleField({ wechatTitle: article.title, wechatMarkdown: article.markdown })
    } catch (error) {
      setMessage(`公众号改写失败：${error instanceof Error ? error.message : '未知错误'}`)
    } finally {
      setIsRewriting(false)
    }
  }

  const handlePublish = async () => {
    const config = getWechatDraftConfig()
    if (!recording || !title.trim() || !markdown.trim() || !config.enabled || !config.workerUrl.trim()) return

    const requestId = crypto.randomUUID()
    setIsPublishing(true)
    setMessage('')
    saveArticleField({ wechatStatus: 'syncing', wechatErrorMessage: undefined, wechatRequestId: requestId })
    try {
      const draft = await publishWechatDraft(config, {
        recordingId: recording.id,
        requestId,
        title: title.trim(),
        markdown: markdown.trim(),
        draftMediaId: recording.wechatDraftMediaId
      })
      saveArticleField({
        wechatStatus: 'drafted',
        wechatDraftMediaId: draft.mediaId,
        wechatErrorMessage: undefined,
        wechatRequestId: requestId
      })
      setMessage(draft.reused ? '草稿箱已保存，无需重复创建。' : '已保存到公众号草稿箱。')
    } catch (error) {
      const text = error instanceof Error ? error.message : '未知错误'
      saveArticleField({
        wechatStatus: error instanceof WechatDraftError && error.kind === 'authorization' ? 'authorization_required' : 'failed',
        wechatErrorMessage: text,
        wechatRequestId: requestId
      })
      setMessage(`发布失败：${text}`)
    } finally {
      setIsPublishing(false)
    }
  }

  const config = getWechatDraftConfig()
  const unavailableReason = !config.enabled
    ? '请先在设置中启用公众号草稿编辑。'
    : !config.workerUrl.trim()
      ? '请先在设置中填写公众号发布服务地址。'
      : ''

  if (recording === undefined) return <section className="view"><p className="empty-state">正在加载公众号编辑器…</p></section>
  if (!recording) return <section className="view"><p className="empty-state">录音不存在或已删除。</p></section>

  return (
    <section className="view" style={{ paddingBottom: '112px' }}>
      <header className="topbar">
        <div>
          <span className="eyebrow">WeChat Draft</span>
          <h1>公众号改写</h1>
        </div>
        <div className="topbar-actions">
          <ThemeToggle />
          <button className="icon-btn" onClick={() => navigate(`/recordings/${recording.id}`)} aria-label="返回详情">×</button>
        </div>
      </header>

      {!recording.summary ? (
        <div className="detail-card"><p className="empty-state">请先完成个人笔记整理，再进行公众号改写。</p></div>
      ) : unavailableReason ? (
        <div className="detail-card"><p className="empty-state">{unavailableReason}</p></div>
      ) : (
        <>
          <div className="detail-card">
            <h3>个人笔记参考</h3>
            <textarea value={recording.summary} readOnly style={{ minHeight: '180px', fontFamily: 'monospace', fontSize: '13px' }} />
          </div>

          <div className="detail-card" style={{ display: 'grid', gap: '12px' }}>
            <h3>公众号提示词</h3>
            <select value={templateId} onChange={(event) => handleTemplateChange(event.target.value)} disabled={isRewriting || isPublishing}>
              {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
            </select>
            <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} onBlur={savePrompt} disabled={isRewriting || isPublishing} style={{ minHeight: '130px' }} />
            <button className="wide-btn" onClick={() => void handleRewrite()} disabled={isRewriting || isPublishing || !prompt.trim()}>
              {isRewriting ? '正在改写…' : '生成公众号版本'}
            </button>
          </div>

          <div className="detail-card" style={{ display: 'grid', gap: '12px' }}>
            <h3>公众号文章</h3>
            <input value={title} onChange={(event) => { setTitle(event.target.value); saveArticleField({ wechatTitle: event.target.value }) }} placeholder="公众号文章标题" disabled={isRewriting || isPublishing} />
            <textarea value={markdown} onChange={(event) => { setMarkdown(event.target.value); saveArticleField({ wechatMarkdown: event.target.value }) }} placeholder="生成后可继续手动修改 Markdown 正文" disabled={isRewriting || isPublishing} style={{ minHeight: '260px', fontFamily: 'monospace', fontSize: '13px' }} />
            <button className="wide-btn primary" onClick={() => void handlePublish()} disabled={isRewriting || isPublishing || !title.trim() || !markdown.trim()}>
              {isPublishing ? '正在保存…' : '发布到草稿箱'}
            </button>
            {(message || recording.wechatErrorMessage) && <div className="row-sub">{message || recording.wechatErrorMessage}</div>}
          </div>
        </>
      )}
    </section>
  )
}
