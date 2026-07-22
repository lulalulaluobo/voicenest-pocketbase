import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { useNavigate } from 'react-router-dom'
import { ThemeToggle } from '../components/ThemeToggle'
import {
  getASRConfig,
  saveASRConfig,
  getLLMConfig,
  saveLLMConfig,
  getWechatDraftConfig,
  saveWechatDraftConfig,
  getWechatPromptTemplates,
  saveWechatPromptTemplates,
  getNoteTypes,
  saveNoteTypes,
  getAudioRetention,
  saveAudioRetention,
  getTextRetention,
  saveTextRetention,
  type AudioRetentionType,
  type TextRetentionType,
  type UserNoteType,
  type WechatPromptTemplate
} from '../lib/config-store'
import { testASRConnection, transcribeAudio } from '../lib/asr'
import { formatNote } from '../lib/llm'
import { checkForAppUpdate, downloadAndInstallAppUpdate } from '../lib/app-update'
import { createObsidianSyncToken, listObsidianSyncTokens, revokeObsidianSyncToken, type ObsidianSyncToken } from '../lib/obsidian-sync'
import {
  getWechatCoverStatus,
  testWechatConnection,
  uploadWechatCover,
  setupWechatCredentials
} from '../lib/wechat'
import { exportFullBackup, readFullBackup, replaceLocalData } from '../lib/backup'
import { getPocketbaseUrl, isAllowedPocketbaseUrl, setPocketbaseUrl, pb } from '../lib/pocketbase'
import defaultWechatCoverUrl from '../assets/default-wechat-cover.png'

const MAX_WECHAT_COVER_BYTES = 5 * 1024 * 1024
const WECHAT_COVER_TYPES = ['image/png', 'image/jpeg', 'image/webp']

export function SettingsPage() {
  const navigate = useNavigate()

  // ASR
  const [asrConfig, setAsrConfig] = useState(getASRConfig())
  const [asrTesting, setAsrTesting] = useState(false)
  const [asrTestResult, setAsrTestResult] = useState<string | null>(null)

  // LLM
  const [llmConfig, setLlmConfig] = useState(getLLMConfig())
  const [llmTesting, setLlmTesting] = useState(false)
  const [llmTestResult, setLlmTestResult] = useState<string | null>(null)

  const [updateBusy, setUpdateBusy] = useState(false)
  const [updateResult, setUpdateResult] = useState<string | null>(null)
  const [obsidianToken, setObsidianToken] = useState<string | null>(null)
  const [showObsidianTokenModal, setShowObsidianTokenModal] = useState(false)
  const [creatingObsidianToken, setCreatingObsidianToken] = useState(false)
  const [obsidianTokens, setObsidianTokens] = useState<ObsidianSyncToken[]>([])
  const [wechatConfig, setWechatConfig] = useState(getWechatDraftConfig())
  const [tempAppId, setTempAppId] = useState(getWechatDraftConfig().appId)
  const [tempAppSecret, setTempAppSecret] = useState('')
  const [wechatSaveResult, setWechatSaveResult] = useState<string | null>(null)
  const [wechatSaving, setWechatSaving] = useState(false)
  const [wechatPromptTemplates, setWechatPromptTemplates] = useState(getWechatPromptTemplates())

  useEffect(() => {
    setTempAppId(wechatConfig.appId)
  }, [wechatConfig.appId])
  const [editingWechatPrompt, setEditingWechatPrompt] = useState<WechatPromptTemplate | null>(null)
  const [wechatTesting, setWechatTesting] = useState(false)
  const [wechatTestResult, setWechatTestResult] = useState<string | null>(null)
  const [wechatCoverConfigured, setWechatCoverConfigured] = useState<boolean | null>(null)
  const [wechatCoverFile, setWechatCoverFile] = useState<File | null>(null)
  const [wechatCoverPreview, setWechatCoverPreview] = useState<string | null>(null)
  const [wechatCoverUploading, setWechatCoverUploading] = useState(false)
  const [wechatCoverResult, setWechatCoverResult] = useState<string | null>(null)

  // Note Types
  const [noteTypes, setNoteTypes] = useState<UserNoteType[]>(getNoteTypes())
  const [editingType, setEditingType] = useState<UserNoteType | null>(null)

  // Auto processing settings
  const [autoProcess, setAutoProcess] = useState(localStorage.getItem('vn_auto_process') === 'true')

  // Retention State
  const [audioRetention, setAudioRetention] = useState<AudioRetentionType>(getAudioRetention())
  const [textRetention, setTextRetention] = useState<TextRetentionType>(getTextRetention())
  const [backupBusy, setBackupBusy] = useState(false)

  // 折叠状态管理：'' | 'asr' | 'llm' | 'sync' | 'wechat' | 'audio_retention' | 'text_retention' | 'backup'
  const [activeCollapse, setActiveCollapse] = useState<string | null>(null)

  // 后端地址配置（APK 必填；Web 走同源默认值）
  const [backendUrlInput, setBackendUrlInput] = useState(getPocketbaseUrl())
  const [backendUrlEditing, setBackendUrlEditing] = useState(false)
  const [backendUrlResult, setBackendUrlResult] = useState<string | null>(null)
  const [backendUrlTesting, setBackendUrlTesting] = useState(false)

  // 密码修改与退出
  const [newPasswordInput, setNewPasswordInput] = useState('')
  const [passwordResetting, setPasswordResetting] = useState(false)
  const [passwordResult, setPasswordResult] = useState<string | null>(null)

  const handleSaveBackendUrl = async () => {
    setBackendUrlResult(null)
    const trimmed = backendUrlInput.trim().replace(/\/+$/, '')
    if (!trimmed) {
      setBackendUrlResult('⚠️ 后端地址不能为空')
      return
    }
    let parsed: URL
    try {
      parsed = new URL(trimmed)
    } catch {
      setBackendUrlResult('⚠️ 地址格式无效，需为完整 URL')
      return
    }
    if (!isAllowedPocketbaseUrl(parsed)) {
      setBackendUrlResult('⚠️ 后端地址必须使用 HTTPS；仅本地开发地址允许 HTTP')
      return
    }
    setBackendUrlTesting(true)
    try {
      const res = await fetch(`${parsed.origin}/api/health`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setPocketbaseUrl(parsed.origin)
      setBackendUrlInput(parsed.origin)
      setBackendUrlEditing(false)
      setBackendUrlResult(`✅ 已保存并验证：${parsed.origin}`)
    } catch (err: any) {
      setBackendUrlResult(`⚠️ 无法连接后端：${err.message}`)
    } finally {
      setBackendUrlTesting(false)
    }
  }

  const handleResetUserPassword = async () => {
    setPasswordResult(null)
    const val = newPasswordInput.trim()
    if (val.length < 8) {
      setPasswordResult('⚠️ 新密码长度必须至少为 8 位')
      return
    }
    if (!pb.authStore.model?.id) {
      setPasswordResult('⚠️ 无法获取当前登录账号信息')
      return
    }
    setPasswordResetting(true)
    try {
      await pb.collection('users').update(pb.authStore.model.id, {
        password: val,
        passwordConfirm: val
      })
      setPasswordResult('✅ 密码已成功重设！下一次登录请使用新密码。')
      setNewPasswordInput('')
    } catch (err: any) {
      setPasswordResult(`⚠️ 重设失败: ${err.message}`)
    } finally {
      setPasswordResetting(false)
    }
  }

  const handleUserLogout = () => {
    if (window.confirm('确认退出当前登录吗？')) {
      pb.authStore.clear()
    }
  }

  useEffect(() => {
    if (activeCollapse !== 'wechat' || !wechatConfig.appId.trim()) return

    let cancelled = false
    getWechatCoverStatus(wechatConfig)
      .then((status) => {
        if (!cancelled) setWechatCoverConfigured(status.configured)
      })
      .catch(() => {
        if (!cancelled) setWechatCoverConfigured(null)
      })
    return () => { cancelled = true }
  }, [activeCollapse, wechatConfig])

  const toggleCollapse = (name: string) => {
    setActiveCollapse(activeCollapse === name ? null : name)
  }

  const handleAudioRetentionChange = (val: AudioRetentionType) => {
    setAudioRetention(val)
    saveAudioRetention(val)
  }

  const handleTextRetentionChange = (val: TextRetentionType) => {
    setTextRetention(val)
    saveTextRetention(val)
  }

  // ASR Save & Test
  const handleASRChange = (field: string, value: string) => {
    const updated = { ...asrConfig, [field]: value }
    setAsrConfig(updated)
    saveASRConfig(updated)
  }

  const handleASRTypeChange = (type: 'openai' | 'step') => {
    let defaults = {
      type,
      endpoint: 'https://api.openai.com/v1',
      model: 'whisper-1',
      apiKey: asrConfig.apiKey
    }
    if (type === 'step') {
      defaults = {
        type,
        endpoint: 'https://api.stepfun.com/v1',
        model: 'stepaudio-2.5-asr',
        apiKey: asrConfig.apiKey
      }
    }
    setAsrConfig(defaults)
    saveASRConfig(defaults)
  }

  const handleTestASR = async () => {
    setAsrTesting(true)
    setAsrTestResult(null)
    try {
      if (asrConfig.type === 'step') {
        await testASRConnection(asrConfig)
        setAsrTestResult('✅ StepAudio API Key 验证成功！')
        return
      }

      function base64ToBlob(base64: string, mimeType: string) {
        const byteCharacters = atob(base64)
        const byteNumbers = new Array(byteCharacters.length)
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i)
        }
        const byteArray = new Uint8Array(byteNumbers)
        return new Blob([byteArray], { type: mimeType })
      }

      const silentWavBase64 = 'UklGRsQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YaAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
      const dummyBlob = base64ToBlob(silentWavBase64, 'audio/wav')
      const text = await transcribeAudio(dummyBlob, asrConfig)
      setAsrTestResult(`✅ 连接成功！转写完成，响应: "${text}"`)
    } catch (err: any) {
      if (err.message.includes('no speech found') || err.message.includes('no_speech_found') || err.message.includes('request_params_invalid')) {
        setAsrTestResult(`✅ 连接成功！已成功连接并鉴权 StepAudio 引擎（由于发送的是超短静音测试音频，引擎未识别到语音内容）`)
      } else {
        setAsrTestResult(`⚠️ 测试连接结果：${err.message}`)
      }
    } finally {
      setAsrTesting(false)
    }
  }

  // LLM Save & Test
  const handleLLMChange = (field: string, value: string) => {
    const updated = { ...llmConfig, [field]: value }
    setLlmConfig(updated)
    saveLLMConfig(updated)
  }

  const handleTestLLM = async () => {
    setLlmTesting(true)
    setLlmTestResult(null)
    try {
      const dummyType = {
        name: '连接测试',
        prompt: '请将以下字符返回。',
        template: '{{content}}'
      }
      const res = await formatNote('Hello LLM', dummyType, llmConfig)
      setLlmTestResult(`✅ 连接成功！返回标题: "${res.title}"`)
    } catch (err: any) {
      setLlmTestResult(`⚠️ 测试连接结果：${err.message}`)
    } finally {
      setLlmTesting(false)
    }
  }

  const handleCheckUpdate = async () => {
    if (!Capacitor.isNativePlatform()) {
      setUpdateResult('APK 更新仅可在 Android 应用内检查。')
      return
    }
    setUpdateBusy(true)
    setUpdateResult(null)
    try {
      const update = await checkForAppUpdate()
      if (!update.available) {
        setUpdateResult('当前已是最新版本。')
      } else if (window.confirm(`发现 v${update.versionName}，是否下载并安装？`)) {
        await downloadAndInstallAppUpdate()
        setUpdateResult('下载与校验完成，请在 Android 系统安装页确认。')
      } else {
        setUpdateResult(`发现新版本 v${update.versionName}。`)
      }
    } catch (error) {
      setUpdateResult(error instanceof Error ? `更新失败：${error.message}` : '更新失败，请稍后重试。')
    } finally {
      setUpdateBusy(false)
    }
  }

  const handleCreateObsidianToken = async () => {
    setCreatingObsidianToken(true)
    try {
      setObsidianToken(await createObsidianSyncToken())
      setShowObsidianTokenModal(true)
      setObsidianTokens(await listObsidianSyncTokens())
    } catch (error) {
      setObsidianToken(error instanceof Error ? error.message : '无法生成同步 Token。')
    } finally {
      setCreatingObsidianToken(false)
    }
  }

  const loadObsidianTokens = async () => setObsidianTokens(await listObsidianSyncTokens())
  const handleRevokeObsidianToken = async (id: string) => {
    await revokeObsidianSyncToken(id)
    await loadObsidianTokens()
  }

  const handleWechatConfigChange = (changes: Partial<typeof wechatConfig>) => {
    const updated = { ...wechatConfig, ...changes }
    setWechatConfig(updated)
    saveWechatDraftConfig(updated)
  }

  const handleSaveWechatConfig = async () => {
    if (!tempAppId.trim()) {
      setWechatSaveResult('⚠️ AppID 不能为空')
      return
    }
    setWechatSaving(true)
    setWechatSaveResult(null)
    try {
      const res = await setupWechatCredentials(tempAppId.trim(), tempAppSecret.trim())
      if (res.configured) {
        const newConfig = {
          enabled: wechatConfig.enabled,
          appId: tempAppId.trim(),
          configured: true
        }
        setWechatConfig(newConfig)
        saveWechatDraftConfig(newConfig)
        setWechatSaveResult('✅ 微信公众号配置已安全加密保存至云端')
        setTempAppSecret('')
      }
    } catch (err: any) {
      setWechatSaveResult(`⚠️ 保存失败: ${err.message}`)
    } finally {
      setWechatSaving(false)
    }
  }

  const handleTestWechat = async () => {
    setWechatTesting(true)
    setWechatTestResult(null)
    try {
      await testWechatConnection(wechatConfig)
      setWechatTestResult('✅ 公众号发布服务连接成功，IP 白名单与草稿权限均可用')
    } catch (err: any) {
      setWechatTestResult(`⚠️ 连接测试失败: ${err.message}`)
    } finally {
      setWechatTesting(false)
    }
  }

  const handleWechatCoverSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!WECHAT_COVER_TYPES.includes(file.type)) {
      setWechatCoverResult('⚠️ 仅支持 PNG、JPEG 或 WebP 图片')
      return
    }
    if (file.size > MAX_WECHAT_COVER_BYTES) {
      setWechatCoverResult('⚠️ 封面图片不能超过 5 MiB')
      return
    }

    const reader = new FileReader()
    reader.onload = () => setWechatCoverPreview(typeof reader.result === 'string' ? reader.result : null)
    reader.readAsDataURL(file)
    setWechatCoverFile(file)
    setWechatCoverResult('已选择新封面，点击“上传选中图片”后才会写入公众号素材库。')
  }

  const handleUploadWechatCover = async (file: File, successMessage: string) => {
    setWechatCoverUploading(true)
    setWechatCoverResult(null)
    try {
      await uploadWechatCover(wechatConfig, file)
      setWechatCoverConfigured(true)
      setWechatCoverFile(null)
      setWechatCoverResult(`✅ ${successMessage}`)
    } catch (err: any) {
      setWechatCoverResult(`⚠️ 封面上传失败: ${err.message}`)
    } finally {
      setWechatCoverUploading(false)
    }
  }

  const handleUploadSelectedWechatCover = async () => {
    if (!wechatCoverFile) {
      setWechatCoverResult('请先选择一张封面图片')
      return
    }
    await handleUploadWechatCover(wechatCoverFile, '默认封面已上传到公众号素材库')
  }

  const handleUseDefaultWechatCover = async () => {
    try {
      const response = await fetch(defaultWechatCoverUrl)
      const blob = await response.blob()
      const file = new File([blob], 'voicenest-default-wechat-cover.png', { type: 'image/png' })
      setWechatCoverPreview(defaultWechatCoverUrl)
      await handleUploadWechatCover(file, '内置默认封面已上传到公众号素材库')
    } catch {
      setWechatCoverResult('⚠️ 无法读取内置默认封面')
    }
  }



  // Auto process toggling
  const handleToggleAutoProcess = () => {
    const val = !autoProcess
    setAutoProcess(val)
    localStorage.setItem('vn_auto_process', val ? 'true' : 'false')
  }

  // Note Types CRUD actions
  const handleAddNoteType = () => {
    const newId = crypto.randomUUID()
    const newType: UserNoteType = {
      id: newId,
      name: '新分类',
      prompt: '整理为简洁清晰的项目随记。',
      template: '# {{title}}\n\n{{content}}',
      obsidianPath: 'Inbox/NewFolder'
    }
    const list = [...noteTypes, newType]
    setNoteTypes(list)
    saveNoteTypes(list)
    setEditingType(newType)
  }

  const handleDeleteNoteType = (id: string) => {
    if (noteTypes.length <= 1) {
      alert('系统必须保留至少一种笔记类型配置。')
      return
    }
    if (window.confirm('确认删除该笔记类型配置吗？')) {
      const list = noteTypes.filter(t => t.id !== id)
      setNoteTypes(list)
      saveNoteTypes(list)
      if (editingType?.id === id) {
        setEditingType(null)
      }
    }
  }

  const handleSaveTypeEdit = (updated: UserNoteType) => {
    const list = noteTypes.map(t => t.id === updated.id ? updated : t)
    setNoteTypes(list)
    saveNoteTypes(list)
    setEditingType(null)
  }

  const handleAddWechatPrompt = () => {
    const template = { id: crypto.randomUUID(), name: '新公众号提示词', prompt: '将这篇个人笔记改写为自然、真诚的公众号文章。' }
    const list = [...wechatPromptTemplates, template]
    setWechatPromptTemplates(list)
    saveWechatPromptTemplates(list)
    setEditingWechatPrompt(template)
  }

  const handleSaveWechatPrompt = (template: WechatPromptTemplate) => {
    const normalized = { ...template, name: template.name.trim(), prompt: template.prompt.trim() }
    if (!normalized.name || !normalized.prompt) {
      alert('名称和提示词不能为空')
      return
    }
    const list = wechatPromptTemplates.map((item) => item.id === normalized.id ? normalized : item)
    setWechatPromptTemplates(list)
    saveWechatPromptTemplates(list)
    setEditingWechatPrompt(null)
  }

  const handleDeleteWechatPrompt = (id: string) => {
    if (!window.confirm('确认删除该公众号提示词吗？')) return
    const list = wechatPromptTemplates.filter((item) => item.id !== id)
    setWechatPromptTemplates(list)
    saveWechatPromptTemplates(list)
    setEditingWechatPrompt(null)
  }

  const handleExportBackup = async () => {
    setBackupBusy(true)
    try {
      const date = new Date().toISOString().slice(0, 10).replaceAll('-', '')
      const destination = await exportFullBackup(`voicenest-backup-${date}.zip`)
      alert(destination === 'native' ? '全量备份已保存至 下载/声笺。文件含 API Key 与 Token，请仅保存到可信位置。' : '全量备份已开始下载。文件含 API Key 与 Token，请仅保存到可信位置。')
    } catch (error) {
      alert(`导出备份失败：${error instanceof Error ? error.message : '未知错误'}`)
    } finally {
      setBackupBusy(false)
    }
  }

  const handleImportBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setBackupBusy(true)
    try {
      const backup = await readFullBackup(file)
      const confirmed = window.confirm(`已校验备份：${backup.manifest.recordingCount} 条录音、${backup.manifest.audioEntries.length} 个音频分片。\n\n继续将删除当前全部录音、音频、设置和 API 凭据，并用备份完整替换。此操作不可撤销。`)
      if (!confirmed) return
      await replaceLocalData(backup)
      alert(`恢复完成：${backup.manifest.recordingCount} 条录音已恢复。应用将刷新。`)
      window.location.reload()
    } catch (error) {
      alert(`导入备份失败：${error instanceof Error ? error.message : '备份文件无效'}`)
    } finally {
      setBackupBusy(false)
    }
  }

  return (
    <section className="view" style={{ paddingBottom: '112px' }}>
      {/* 顶部栏 */}
      <header className="topbar">
        <div>
          <span className="eyebrow">Preferences</span>
          <h1>设置</h1>
        </div>
        <div className="topbar-actions">
          <ThemeToggle />
          <button className="icon-btn" onClick={() => navigate('/')} aria-label="关闭设置">
            ×
          </button>
        </div>
      </header>

      {/* 0. 后端地址（APK 必填；Web 走同源默认值） */}
      <section className="settings-card">
        <h3>后端连接</h3>
        <div className="row" onClick={() => !backendUrlEditing && setBackendUrlEditing(true)}>
          <div className="row-main">
            <div className="row-title">PocketBase 后端地址</div>
            <div className="row-sub">
              {getPocketbaseUrl() || '未配置（APK 必须填写自己的后端 HTTPS 地址）'}
            </div>
          </div>
          <div style={{ color: 'var(--muted)' }}>{backendUrlEditing ? '▼' : '›'}</div>
        </div>
        {backendUrlEditing && (
          <div style={{ padding: '12px 0', borderTop: '1px dashed var(--line)', display: 'grid', gap: '10px' }}>
            <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
              APK 模式下必须配置你自己部署的 PocketBase 后端地址。保存后会重新连接，如已登录需重新登录。
            </div>
            <input
              type="url"
              value={backendUrlInput}
              onChange={e => setBackendUrlInput(e.target.value)}
              placeholder="https://voicenest.example.com"
              className="input-field"
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '10px',
                border: '1px solid var(--line)',
                background: 'var(--soft)',
                color: 'var(--text)',
                fontSize: '14px'
              }}
            />
            {backendUrlResult && (
              <div style={{ fontSize: '13px', color: backendUrlResult.startsWith('✅') ? 'var(--success)' : 'var(--danger)' }}>
                {backendUrlResult}
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="action primary"
                onClick={handleSaveBackendUrl}
                disabled={backendUrlTesting}
                style={{ padding: '10px' }}
              >
                {backendUrlTesting ? '验证中…' : '验证并保存'}
              </button>
              <button
                type="button"
                className="action"
                onClick={() => { setBackendUrlEditing(false); setBackendUrlResult(null); setBackendUrlInput(getPocketbaseUrl()) }}
                style={{ padding: '10px' }}
              >
                取消
              </button>
            </div>
          </div>
        )}
      </section>

      {/* 1. 录音与处理卡片 */}
      <section className="settings-card">
        <h3>录音与处理</h3>
        
        {/* 自动处理 */}
        <div className="row" onClick={handleToggleAutoProcess}>
          <div className="row-main">
            <div className="row-title">录音结束后自动处理</div>
            <div className="row-sub">自动转写、整理并同步到 Obsidian</div>
          </div>
          <div className={`switch ${autoProcess ? 'on' : ''}`} />
        </div>

        {/* 音频保留 */}
        <div className="row" onClick={() => toggleCollapse('audio_retention')}>
          <div className="row-main">
            <div className="row-title">音频保留策略</div>
            <div className="row-sub">
              {audioRetention === 'forever' ? '永久保留' : audioRetention === 'immediate' ? '立即删除' : `同步成功后保留 ${audioRetention}`}
            </div>
          </div>
          <div style={{ color: 'var(--muted)' }}>{activeCollapse === 'audio_retention' ? '▼' : '›'}</div>
        </div>
        {activeCollapse === 'audio_retention' && (
          <div style={{ padding: '10px 0', borderTop: '1px dashed var(--line)' }}>
            <select
              value={audioRetention}
              onChange={(e) => handleAudioRetentionChange(e.target.value as AudioRetentionType)}
              style={{ width: '100%', minHeight: '44px', padding: '0 12px', borderRadius: '8px', border: '1px solid var(--line)', background: 'var(--card2)', color: 'var(--text)', fontSize: '13px' }}
            >
              <option value="forever">永久保留 (默认)</option>
              <option value="immediate">同步成功后立即删除 (仅保留文本历史)</option>
              <option value="7d">保留 7 天后删除</option>
              <option value="30d">保留 30 天后删除</option>
            </select>
          </div>
        )}

        {/* 文本保留 */}
        <div className="row" onClick={() => toggleCollapse('text_retention')}>
          <div className="row-main">
            <div className="row-title">文本保留策略</div>
            <div className="row-sub">
              {textRetention === 'forever' ? '永久保留' : `同步成功后保留 ${textRetention}`}
            </div>
          </div>
          <div style={{ color: 'var(--muted)' }}>{activeCollapse === 'text_retention' ? '▼' : '›'}</div>
        </div>
        {activeCollapse === 'text_retention' && (
          <div style={{ padding: '10px 0', borderTop: '1px dashed var(--line)' }}>
            <select
              value={textRetention}
              onChange={(e) => handleTextRetentionChange(e.target.value as TextRetentionType)}
              style={{ width: '100%', minHeight: '44px', padding: '0 12px', borderRadius: '8px', border: '1px solid var(--line)', background: 'var(--card2)', color: 'var(--text)', fontSize: '13px' }}
            >
              <option value="forever">永久保留 (默认)</option>
              <option value="7d">保留 7 天后全部删除</option>
              <option value="30d">保留 30 天后全部删除</option>
            </select>
          </div>
        )}
      </section>

      {/* 2. 模型服务卡片 */}
      <section className="settings-card">
        <h3>模型服务</h3>

        {/* ASR 服务 */}
        <div className="row" onClick={() => toggleCollapse('asr')}>
          <div className="row-main">
            <div className="row-title">ASR 服务</div>
            <div className="row-sub">
              {asrConfig.type === 'step' ? '阶跃星辰 StepAudio' : 'OpenAI Whisper'} · {asrConfig.model}
            </div>
          </div>
          <div style={{ color: 'var(--muted)' }}>{activeCollapse === 'asr' ? '▼' : '›'}</div>
        </div>
        {activeCollapse === 'asr' && (
          <div style={{ padding: '12px 0', borderTop: '1px dashed var(--line)', display: 'grid', gap: '8px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#81766c' }}>服务商类型</label>
              <select
                value={asrConfig.type}
                onChange={(e) => handleASRTypeChange(e.target.value as 'openai' | 'step')}
                style={{ minHeight: '40px', padding: '0 8px', borderRadius: '6px', border: '1px solid var(--line)', background: 'var(--card2)', color: 'var(--text)' }}
              >
                <option value="openai">OpenAI 兼容</option>
                <option value="step">阶跃星辰 StepAudio</option>
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#81766c' }}>API 端点 URL</label>
              <input
                type="text"
                value={asrConfig.endpoint}
                onChange={(e) => handleASRChange('endpoint', e.target.value)}
                style={{ minHeight: '40px', padding: '0 8px', borderRadius: '6px', border: '1px solid var(--line)', background: 'var(--card2)', color: 'var(--text)' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#81766c' }}>API Key</label>
              <input
                type="password"
                value={asrConfig.apiKey}
                onChange={(e) => handleASRChange('apiKey', e.target.value)}
                style={{ minHeight: '40px', padding: '0 8px', borderRadius: '6px', border: '1px solid var(--line)', background: 'var(--card2)', color: 'var(--text)' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#81766c' }}>转写模型</label>
              <input
                type="text"
                value={asrConfig.model}
                onChange={(e) => handleASRChange('model', e.target.value)}
                style={{ minHeight: '40px', padding: '0 8px', borderRadius: '6px', border: '1px solid var(--line)', background: 'var(--card2)', color: 'var(--text)' }}
              />
            </div>
            <button
              type="button"
              onClick={handleTestASR}
              disabled={asrTesting}
              style={{ minHeight: '40px', background: 'var(--accent)', color: 'var(--accentText)', border: 0, borderRadius: '6px', fontWeight: 'bold', marginTop: '6px' }}
            >
              {asrTesting ? '正在测试...' : '测试 ASR 连接'}
            </button>
            {asrTestResult && (
              <div style={{ fontSize: '12px', background: 'var(--soft)', padding: '8px', borderRadius: '6px', marginTop: '4px' }}>
                {asrTestResult}
              </div>
            )}
          </div>
        )}

        {/* LLM 服务 */}
        <div className="row" onClick={() => toggleCollapse('llm')}>
          <div className="row-main">
            <div className="row-title">默认 LLM</div>
            <div className="row-sub">OpenAI 兼容 · {llmConfig.model}</div>
          </div>
          <div style={{ color: 'var(--muted)' }}>{activeCollapse === 'llm' ? '▼' : '›'}</div>
        </div>
        {activeCollapse === 'llm' && (
          <div style={{ padding: '12px 0', borderTop: '1px dashed var(--line)', display: 'grid', gap: '8px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#81766c' }}>API 端点 URL</label>
              <input
                type="text"
                value={llmConfig.endpoint}
                onChange={(e) => handleLLMChange('endpoint', e.target.value)}
                style={{ minHeight: '40px', padding: '0 8px', borderRadius: '6px', border: '1px solid var(--line)', background: 'var(--card2)', color: 'var(--text)' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#81766c' }}>API Key</label>
              <input
                type="password"
                value={llmConfig.apiKey}
                onChange={(e) => handleLLMChange('apiKey', e.target.value)}
                style={{ minHeight: '40px', padding: '0 8px', borderRadius: '6px', border: '1px solid var(--line)', background: 'var(--card2)', color: 'var(--text)' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#81766c' }}>模型名称</label>
              <input
                type="text"
                value={llmConfig.model}
                onChange={(e) => handleLLMChange('model', e.target.value)}
                style={{ minHeight: '40px', padding: '0 8px', borderRadius: '6px', border: '1px solid var(--line)', background: 'var(--card2)', color: 'var(--text)' }}
              />
            </div>
            <button
              type="button"
              onClick={handleTestLLM}
              disabled={llmTesting}
              style={{ minHeight: '40px', background: 'var(--accent)', color: 'var(--accentText)', border: 0, borderRadius: '6px', fontWeight: 'bold', marginTop: '6px' }}
            >
              {llmTesting ? '正在测试...' : '测试 LLM 连接'}
            </button>
            {llmTestResult && (
              <div style={{ fontSize: '12px', background: 'var(--soft)', padding: '8px', borderRadius: '6px', marginTop: '4px' }}>
                {llmTestResult}
              </div>
            )}
          </div>
        )}

        <div className="row">
          <div className="row-main">
            <div className="row-title">Obsidian 本地插件同步</div>
            <div className="row-sub">整理后的笔记会进入 PocketBase 队列，由插件使用可撤销 Token 单向拉取到 Vault。</div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <button type="button" className="action primary" onClick={(event) => { event.stopPropagation(); void handleCreateObsidianToken() }} disabled={creatingObsidianToken}>
                {creatingObsidianToken ? '正在生成…' : '生成插件同步 Token'}
              </button>
              <button type="button" className="action" onClick={(event) => { event.stopPropagation(); void loadObsidianTokens() }}>管理 Token</button>
            </div>
            {obsidianToken && <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--muted)' }}>新 Token 已生成，请在弹窗中复制后关闭。</div>}
            {obsidianTokens.map((token) => <div key={token.id} style={{ display: 'flex', gap: '8px', marginTop: '8px', fontSize: '12px', alignItems: 'center' }}><span>{token.label} · 最近使用：{token.lastUsedAt || '从未'}</span><button type="button" className="action danger" onClick={() => void handleRevokeObsidianToken(token.id)}>撤销</button></div>)}
          </div>
        </div>

        <div className="row">
          <div className="row-main">
            <div className="row-title">VoiceNest 更新</div>
            <div className="row-sub">GitHub Release 提供正式签名 APK；下载前会校验摘要、包名、版本和签名。</div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
              <a className="action" href="https://github.com/lulalulaluobo/voicenest-pocketbase" target="_blank" rel="noreferrer">GitHub 仓库</a>
              <button type="button" className="action primary" onClick={() => void handleCheckUpdate()} disabled={updateBusy}>
                {updateBusy ? '正在检查…' : '检查 APK 更新'}
              </button>
            </div>
            {updateResult && <div style={{ fontSize: '12px', marginTop: '8px', color: 'var(--muted)' }}>{updateResult}</div>}
          </div>
        </div>

        <div className="row" onClick={() => toggleCollapse('wechat')}>
          <div className="row-main">
            <div className="row-title">公众号草稿箱</div>
            <div className="row-sub">{wechatConfig.enabled ? '已启用 · 手动改写后发布到草稿箱' : '未启用'}</div>
          </div>
          <div style={{ color: 'var(--muted)' }}>{activeCollapse === 'wechat' ? '▼' : '›'}</div>
        </div>
        {activeCollapse === 'wechat' && (
          <div style={{ padding: '12px 0', borderTop: '1px dashed var(--line)', display: 'grid', gap: '8px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
              <input
                type="checkbox"
                checked={wechatConfig.enabled}
                onChange={(e) => handleWechatConfigChange({ enabled: e.target.checked })}
              />
              启用公众号草稿编辑
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#81766c' }}>微信公众号 AppID</label>
              <input
                type="text"
                value={tempAppId || ''}
                placeholder="wx1234567890abcdef"
                onChange={(e) => setTempAppId(e.target.value)}
                style={{ minHeight: '40px', padding: '0 8px', borderRadius: '6px', border: '1px solid var(--line)', background: 'var(--card2)', color: 'var(--text)' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#81766c' }}>微信公众号 AppSecret</label>
              <input
                type="password"
                value={tempAppSecret || ''}
                placeholder={wechatConfig.configured ? "•••••••••••••••• (已安全配置，输入可覆盖)" : "填写您的微信公众号 AppSecret"}
                onChange={(e) => setTempAppSecret(e.target.value)}
                style={{ minHeight: '40px', padding: '0 8px', borderRadius: '6px', border: '1px solid var(--line)', background: 'var(--card2)', color: 'var(--text)' }}
              />
            </div>
            <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
              AppID 和 AppSecret 保存在您的 PocketBase 私有云端，请求微信时将通过安全后端代理，不会暴露给前端。
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" className="action primary" onClick={handleSaveWechatConfig} disabled={wechatSaving}>
                {wechatSaving ? '正在保存...' : '保存微信配置'}
              </button>
              <button type="button" className="action" onClick={handleTestWechat} disabled={wechatTesting || !wechatConfig.configured}>
                {wechatTesting ? '正在测试...' : '测试公众号连接'}
              </button>
            </div>
            {wechatSaveResult && (
              <div style={{ fontSize: '12px', background: 'var(--soft)', padding: '8px', borderRadius: '6px' }}>
                {wechatSaveResult}
              </div>
            )}
            {wechatTestResult && (
              <div style={{ fontSize: '12px', background: 'var(--soft)', padding: '8px', borderRadius: '6px' }}>
                {wechatTestResult}
              </div>
            )}
            <div style={{ display: 'grid', gap: '8px', paddingTop: '8px', borderTop: '1px dashed var(--line)' }}>
              <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#81766c' }}>公众号默认封面</div>
              <img
                src={wechatCoverPreview ?? defaultWechatCoverUrl}
                alt="公众号默认封面预览"
                style={{ width: '100%', maxWidth: '300px', aspectRatio: '1922 / 818', objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--line)' }}
              />
              <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                {wechatCoverConfigured === true ? '已在公众号素材库配置默认封面。' : '尚未配置默认封面；发布草稿前请先上传。'}
                {' '}支持 PNG、JPEG、WebP，最大 5 MiB。上传会写入公众号永久素材库。
              </div>
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleWechatCoverSelection} />
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button type="button" className="action" onClick={handleUseDefaultWechatCover} disabled={wechatCoverUploading}>
                  使用内置默认封面
                </button>
                <button type="button" className="action primary" onClick={handleUploadSelectedWechatCover} disabled={wechatCoverUploading || !wechatCoverFile}>
                  {wechatCoverUploading ? '正在上传...' : '上传选中图片'}
                </button>
              </div>
              {wechatCoverResult && (
                <div style={{ fontSize: '12px', background: 'var(--soft)', padding: '8px', borderRadius: '6px' }}>
                  {wechatCoverResult}
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="settings-card">
        <h3>公众号提示词管理</h3>
        {wechatPromptTemplates.map((template) => (
          <div key={template.id} className="row" onClick={() => setEditingWechatPrompt(template)}>
            <div className="row-main">
              <div className="row-title">{template.name}</div>
              <div className="row-sub">{template.prompt.slice(0, 34)}{template.prompt.length > 34 ? '…' : ''}</div>
            </div>
            <div style={{ color: 'var(--muted)' }}>›</div>
          </div>
        ))}
        <div className="row" onClick={handleAddWechatPrompt} style={{ color: 'var(--success)' }}>
          <div className="row-main"><div className="row-title" style={{ fontWeight: 'bold' }}>＋ 新增公众号提示词</div></div>
          <div>＋</div>
        </div>
      </section>

      {/* 3. 笔记类型卡片 */}
      <section className="settings-card">
        <h3>笔记分类管理</h3>
        {noteTypes.map((type) => (
          <div key={type.id} className="row" onClick={() => setEditingType(type)}>
            <div className="row-main">
              <div className="row-title">{type.name}</div>
              <div className="row-sub">{type.obsidianPath} · {type.isDefault ? '默认分类' : '普通分类'}</div>
            </div>
            <div style={{ color: 'var(--muted)' }}>›</div>
          </div>
        ))}
        
        {/* 新增分类 */}
        <div className="row" onClick={handleAddNoteType} style={{ color: 'var(--success)' }}>
          <div className="row-main">
            <div className="row-title" style={{ fontWeight: 'bold' }}>＋ 新增笔记分类</div>
            <div className="row-sub" style={{ color: 'var(--success)' }}>点击在此配置新笔记模版和保存目录</div>
          </div>
          <div>＋</div>
        </div>
      </section>

      {/* 4. 数据备份与恢复卡片 */}
      <section className="settings-card">
        <h3>数据备份与恢复</h3>
        <div className="row" onClick={() => toggleCollapse('backup')}>
          <div className="row-main">
            <div className="row-title">备份与恢复</div>
            <div className="row-sub">导出录音、文本、提示词与凭据；导入会完整替换本地数据</div>
          </div>
          <div style={{ color: 'var(--muted)' }}>{activeCollapse === 'backup' ? '▼' : '›'}</div>
        </div>
        {activeCollapse === 'backup' && (
          <div style={{ padding: '12px 0', borderTop: '1px dashed var(--line)', display: 'grid', gap: '10px' }}>
            <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
              ⚠️ 安全提示：备份文件包含 API Key、Obsidian Token 等敏感凭据，仅限个人离线保存；导入会删除当前全部本地数据。
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="action primary"
                onClick={handleExportBackup}
                disabled={backupBusy}
                style={{ padding: '10px' }}
              >
                📤 {backupBusy ? '正在导出…' : '导出全量备份'}
              </button>
              <label
                className="action"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'var(--soft)',
                  cursor: backupBusy ? 'default' : 'pointer',
                  opacity: backupBusy ? 0.65 : 1,
                  pointerEvents: backupBusy ? 'none' : undefined,
                }}
              >
                📥 {backupBusy ? '正在导入…' : '导入全量备份'}
                <input
                  type="file"
                  accept=".zip,application/zip"
                  onChange={handleImportBackup}
                  disabled={backupBusy}
                  style={{ display: 'none' }}
                />
              </label>
            </div>
          </div>
        )}
      </section>

      {/* 5. 账户与安全卡片 */}
      <section className="settings-card">
        <h3>账户与安全</h3>
        <div className="row" onClick={() => toggleCollapse('account')}>
          <div className="row-main">
            <div className="row-title">当前账户</div>
            <div className="row-sub">
              {pb.authStore.model?.email || pb.authStore.model?.username || '已登录账户'}
            </div>
          </div>
          <div style={{ color: 'var(--muted)' }}>{activeCollapse === 'account' ? '▼' : '›'}</div>
        </div>
        {activeCollapse === 'account' && (
          <div style={{ padding: '12px 0', borderTop: '1px dashed var(--line)', display: 'grid', gap: '10px' }}>
            <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
              您无需输入旧密码，可在此直接重设本账户的登录密码。
            </div>
            
            <div style={{ display: 'grid', gap: '4px' }}>
              <input
                type="password"
                value={newPasswordInput}
                onChange={e => setNewPasswordInput(e.target.value)}
                placeholder="输入新密码 (至少8位)"
                className="input-field"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  border: '1px solid var(--line)',
                  background: 'var(--soft)',
                  color: 'var(--text)',
                  fontSize: '14px'
                }}
              />
            </div>

            {passwordResult && (
              <div style={{ fontSize: '13px', color: passwordResult.startsWith('✅') ? 'var(--success)' : 'var(--danger)' }}>
                {passwordResult}
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="action primary"
                onClick={handleResetUserPassword}
                disabled={passwordResetting}
                style={{ padding: '10px' }}
              >
                🔒 {passwordResetting ? '正在重设…' : '直接重设密码'}
              </button>
              <button
                type="button"
                className="action danger"
                onClick={handleUserLogout}
                style={{ padding: '10px', background: 'var(--dangerBg)', border: '1px solid var(--line)' }}
              >
                🚪 退出当前登录
              </button>
            </div>
          </div>
        )}
      </section>

      {editingWechatPrompt && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(0,0,0,0.42)' }} onClick={() => setEditingWechatPrompt(null)} />
          <div className="sheet show" style={{ zIndex: 85, maxHeight: '85vh', overflowY: 'auto' }}>
            <div className="grab" />
            <div className="sheet-head">
              <h3>编辑公众号提示词</h3>
              <button className="icon-btn" onClick={() => setEditingWechatPrompt(null)}>×</button>
            </div>
            <div style={{ display: 'grid', gap: '12px', paddingBottom: '16px' }}>
              <label style={{ display: 'grid', gap: '4px' }}>
                <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#81766c' }}>名称</span>
                <input value={editingWechatPrompt.name} onChange={(event) => setEditingWechatPrompt({ ...editingWechatPrompt, name: event.target.value })} />
              </label>
              <label style={{ display: 'grid', gap: '4px' }}>
                <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#81766c' }}>提示词</span>
                <textarea value={editingWechatPrompt.prompt} onChange={(event) => setEditingWechatPrompt({ ...editingWechatPrompt, prompt: event.target.value })} style={{ minHeight: '150px' }} />
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" className="action primary" onClick={() => handleSaveWechatPrompt(editingWechatPrompt)}>保存配置</button>
                <button type="button" className="action danger" onClick={() => handleDeleteWechatPrompt(editingWechatPrompt.id)}>删除</button>
              </div>
            </div>
          </div>
        </>
      )}

      {showObsidianTokenModal && obsidianToken && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(0,0,0,0.42)' }} onClick={() => setShowObsidianTokenModal(false)} />
          <div className="sheet show" style={{ zIndex: 85 }}>
            <div className="grab" />
            <div className="sheet-head"><h3>复制 Obsidian 同步 Token</h3><button className="icon-btn" onClick={() => setShowObsidianTokenModal(false)}>×</button></div>
            <p style={{ fontSize: '13px', color: 'var(--muted)' }}>此 Token 只会由服务器返回一次。复制到 Obsidian 插件后再关闭。</p>
            <textarea readOnly value={obsidianToken} onFocus={(event) => event.currentTarget.select()} style={{ width: '100%', minHeight: '96px', wordBreak: 'break-all' }} />
            <button type="button" className="action primary" onClick={() => void navigator.clipboard.writeText(obsidianToken)}>复制 Token</button>
          </div>
        </>
      )}

      {/* 类别编辑悬浮弹层 */}
      {editingType && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(0,0,0,0.42)' }} onClick={() => setEditingType(null)} />
          <div
            className="sheet show"
            style={{
              zIndex: 85,
              maxHeight: '85vh',
              overflowY: 'auto'
            }}
          >
            <div className="grab" />
            <div className="sheet-head">
              <h3>编辑分类: {editingType.name}</h3>
              <button className="icon-btn" onClick={() => setEditingType(null)}>×</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingBottom: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#81766c' }}>分类名称</label>
                <input
                  type="text"
                  value={editingType.name}
                  onChange={(e) => setEditingType({ ...editingType, name: e.target.value })}
                  style={{ minHeight: '40px', padding: '0 8px', borderRadius: '8px', border: '1px solid var(--line)', background: 'var(--card2)', color: 'var(--text)' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#81766c' }}>Obsidian 目录</label>
                <input
                  type="text"
                  value={editingType.obsidianPath}
                  onChange={(e) => setEditingType({ ...editingType, obsidianPath: e.target.value })}
                  style={{ minHeight: '40px', padding: '0 8px', borderRadius: '8px', border: '1px solid var(--line)', background: 'var(--card2)', color: 'var(--text)' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#81766c' }}>整理提示词 (LLM)</label>
                <textarea
                  value={editingType.prompt}
                  onChange={(e) => setEditingType({ ...editingType, prompt: e.target.value })}
                  style={{ minHeight: '60px' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#81766c' }}>Markdown 模板</label>
                <textarea
                  value={editingType.template}
                  onChange={(e) => setEditingType({ ...editingType, template: e.target.value })}
                  style={{ minHeight: '100px', fontFamily: 'monospace', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                <button
                  type="button"
                  className="action primary"
                  onClick={() => handleSaveTypeEdit(editingType)}
                  style={{ minHeight: '44px' }}
                >
                  保存配置
                </button>
                <button
                  type="button"
                  className="action danger"
                  onClick={() => handleDeleteNoteType(editingType.id)}
                  style={{ minHeight: '44px', background: 'var(--dangerBg)', border: '1px solid var(--line)' }}
                >
                  删除该分类
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  )
}
