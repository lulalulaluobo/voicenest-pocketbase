import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ThemeToggle } from '../components/ThemeToggle'
import {
  getASRConfig,
  saveASRConfig,
  getLLMConfig,
  saveLLMConfig,
  getSyncConfig,
  saveSyncConfig,
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
  type UserNoteType
} from '../lib/config-store'
import { transcribeAudio } from '../lib/asr'
import { formatNote } from '../lib/llm'
import { testSyncConnection } from '../lib/sync'
import { testWechatConnection } from '../lib/wechat'

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

  // Sync
  const [syncConfig, setSyncConfig] = useState(getSyncConfig())
  const [fnsJsonInput, setFnsJsonInput] = useState('')
  const [syncTesting, setSyncTesting] = useState(false)
  const [syncTestResult, setSyncTestResult] = useState<string | null>(null)
  const [wechatConfig, setWechatConfig] = useState(getWechatDraftConfig())
  const [wechatPromptTemplates, setWechatPromptTemplates] = useState(getWechatPromptTemplates())
  const [wechatTesting, setWechatTesting] = useState(false)
  const [wechatTestResult, setWechatTestResult] = useState<string | null>(null)

  // Note Types
  const [noteTypes, setNoteTypes] = useState<UserNoteType[]>(getNoteTypes())
  const [editingType, setEditingType] = useState<UserNoteType | null>(null)

  // Auto processing settings
  const [autoProcess, setAutoProcess] = useState(localStorage.getItem('vn_auto_process') === 'true')

  // Retention State
  const [audioRetention, setAudioRetention] = useState<AudioRetentionType>(getAudioRetention())
  const [textRetention, setTextRetention] = useState<TextRetentionType>(getTextRetention())

  // 折叠状态管理：'' | 'asr' | 'llm' | 'sync' | 'wechat' | 'audio_retention' | 'text_retention' | 'backup'
  const [activeCollapse, setActiveCollapse] = useState<string | null>(null)

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
      if (err.message.includes('no speech found') || err.message.includes('request_params_invalid')) {
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

  // Sync Save
  const handleSyncFieldChange = (field: string, value: string) => {
    const updated = { ...syncConfig, [field]: value }
    setSyncConfig(updated)
    saveSyncConfig(updated)
  }

  const handleParseFnsJson = (rawText: string) => {
    try {
      const parsed = JSON.parse(rawText.trim())
      const missing = ["api", "apiToken", "vault"].filter((k) => !String(parsed[k] || "").trim())
      if (missing.length) {
        alert(`FNS 配置缺少必需字段: ${missing.join(", ")}`)
        return
      }
      const updated = {
        api: String(parsed.api).trim().replace(/\/+$/, ""),
        apiToken: String(parsed.apiToken).trim(),
        vault: String(parsed.vault).trim()
      }
      setSyncConfig(updated)
      saveSyncConfig(updated)
      setFnsJsonInput('')
      alert("FNS 配置已成功解析并填充，已自动保存！")
    } catch (err: any) {
      alert("解析失败，请确保粘贴的是合法的 FNS 配置 JSON 字符串")
    }
  }

  const handleClipboardImport = async () => {
    try {
      const text = await navigator.clipboard.readText()
      setFnsJsonInput(text)
      handleParseFnsJson(text)
    } catch (err) {
      alert("无法读取系统剪贴板，请在输入框内手动粘贴后点击“解析并填充”")
    }
  }

  const handleTestSync = async () => {
    setSyncTesting(true)
    setSyncTestResult(null)
    try {
      await testSyncConnection(syncConfig)
      setSyncTestResult("✅ Obsidian 连接测试成功！已成功握手 Fast Note Sync 插件")
    } catch (err: any) {
      setSyncTestResult(`⚠️ 连接测试失败: ${err.message}`)
    } finally {
      setSyncTesting(false)
    }
  }

  const handleWechatConfigChange = (changes: Partial<typeof wechatConfig>) => {
    const updated = { ...wechatConfig, ...changes }
    setWechatConfig(updated)
    saveWechatDraftConfig(updated)
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

  const handleOpenWechatAuthorization = () => {
    const url = wechatConfig.workerUrl.trim()
    if (!url) {
      alert('请先填写公众号发布服务地址')
      return
    }
    window.open(url, '_blank', 'noopener,noreferrer')
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

  // 导出备份
  const handleExportBackup = () => {
    try {
      const backupData = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        autoProcess,
        noteTypes,
        asrConfig: { ...asrConfig, apiKey: '' },
        llmConfig: { ...llmConfig, apiKey: '' },
        syncConfig: { ...syncConfig, apiToken: '' },
        wechatConfig,
        wechatPromptTemplates: getWechatPromptTemplates(),
        audioRetention,
        textRetention
      }
      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const now = new Date()
      const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
      a.href = url
      a.download = `voicenest_backup_${dateStr}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err: any) {
      alert(`导出备份失败: ${err.message}`)
    }
  }

  // 导入备份
  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const raw = event.target?.result as string
        const parsed = JSON.parse(raw)

        if (!parsed.noteTypes || !Array.isArray(parsed.noteTypes)) {
          throw new Error('备份文件格式不正确，缺少有效的分类配置。')
        }

        if (parsed.asrConfig) {
          const mergedAsr = { ...parsed.asrConfig }
          if (!mergedAsr.apiKey && asrConfig.apiKey) {
            mergedAsr.apiKey = asrConfig.apiKey
          }
          setAsrConfig(mergedAsr)
          saveASRConfig(mergedAsr)
        }

        if (parsed.llmConfig) {
          const mergedLlm = { ...parsed.llmConfig }
          if (!mergedLlm.apiKey && llmConfig.apiKey) {
            mergedLlm.apiKey = llmConfig.apiKey
          }
          setLlmConfig(mergedLlm)
          saveLLMConfig(mergedLlm)
        }

        if (parsed.syncConfig) {
          const mergedSync = { ...parsed.syncConfig }
          if (!mergedSync.apiToken && syncConfig.apiToken) {
            mergedSync.apiToken = syncConfig.apiToken
          }
          setSyncConfig(mergedSync)
          saveSyncConfig(mergedSync)
        }

        if (parsed.wechatConfig) {
          const importedWechat = {
            enabled: Boolean(parsed.wechatConfig.enabled),
            workerUrl: String(parsed.wechatConfig.workerUrl || '').trim()
          }
          setWechatConfig(importedWechat)
          saveWechatDraftConfig(importedWechat)
        }

        if (Array.isArray(parsed.wechatPromptTemplates)) {
          saveWechatPromptTemplates(parsed.wechatPromptTemplates)
        }

        setNoteTypes(parsed.noteTypes)
        saveNoteTypes(parsed.noteTypes)

        if (parsed.autoProcess !== undefined) {
          setAutoProcess(parsed.autoProcess)
          localStorage.setItem('vn_auto_process', parsed.autoProcess ? 'true' : 'false')
        }
        if (parsed.audioRetention !== undefined) {
          setAudioRetention(parsed.audioRetention)
          saveAudioRetention(parsed.audioRetention)
        }
        if (parsed.textRetention !== undefined) {
          setTextRetention(parsed.textRetention)
          saveTextRetention(parsed.textRetention)
        }

        alert('🎉 备份导入成功！已为您恢复所有分类、同步策略及选项。已自动为您保留本地已填写的 API 鉴权密钥，无需重填。')
        window.location.reload()
      } catch (err: any) {
        alert(`导入备份失败: ${err.message}`)
      }
    }
    reader.readAsText(file)
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

        {/* Fast Note Sync */}
        <div className="row" onClick={() => toggleCollapse('sync')}>
          <div className="row-main">
            <div className="row-title">Fast Note Sync (Obsidian)</div>
            <div className="row-sub">{syncConfig.api ? `已连接 · Vault: ${syncConfig.vault}` : '未配置'}</div>
          </div>
          <div style={{ color: 'var(--muted)' }}>{activeCollapse === 'sync' ? '▼' : '›'}</div>
        </div>
        {activeCollapse === 'sync' && (
          <div style={{ padding: '12px 0', borderTop: '1px dashed var(--line)', display: 'grid', gap: '8px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#81766c' }}>一键导入 FNS JSON</label>
              <textarea
                value={fnsJsonInput}
                onChange={(e) => setFnsJsonInput(e.target.value)}
                placeholder='例: {"api":"https://...","apiToken":"...","vault":"obsidian"}'
                style={{ minHeight: '60px', fontSize: '12px', fontFamily: 'monospace' }}
              />
              <div style={{ display: 'flex', gap: '6px', marginTop: '2px' }}>
                <button
                  type="button"
                  className="action"
                  onClick={handleClipboardImport}
                  style={{ padding: '6px 10px', fontSize: '12px' }}
                >
                  📋 剪贴板导入
                </button>
                <button
                  type="button"
                  className="action primary"
                  onClick={() => handleParseFnsJson(fnsJsonInput)}
                  disabled={!fnsJsonInput.trim()}
                  style={{ padding: '6px 10px', fontSize: '12px' }}
                >
                  解析并填充
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
              <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#81766c' }}>FNS 基础地址 (API)</label>
              <input
                type="text"
                value={syncConfig.api}
                onChange={(e) => handleSyncFieldChange('api', e.target.value)}
                style={{ minHeight: '40px', padding: '0 8px', borderRadius: '6px', border: '1px solid var(--line)', background: 'var(--card2)', color: 'var(--text)' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#81766c' }}>Vault 名称</label>
              <input
                type="text"
                value={syncConfig.vault}
                onChange={(e) => handleSyncFieldChange('vault', e.target.value)}
                style={{ minHeight: '40px', padding: '0 8px', borderRadius: '6px', border: '1px solid var(--line)', background: 'var(--card2)', color: 'var(--text)' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#81766c' }}>API Token</label>
              <input
                type="password"
                value={syncConfig.apiToken}
                onChange={(e) => handleSyncFieldChange('apiToken', e.target.value)}
                style={{ minHeight: '40px', padding: '0 8px', borderRadius: '6px', border: '1px solid var(--line)', background: 'var(--card2)', color: 'var(--text)' }}
              />
            </div>
            <button
              type="button"
              onClick={handleTestSync}
              disabled={syncTesting}
              style={{ minHeight: '40px', background: 'var(--accent)', color: 'var(--accentText)', border: 0, borderRadius: '6px', fontWeight: 'bold', marginTop: '6px' }}
            >
              {syncTesting ? '正在测试...' : '测试 FNS 连接'}
            </button>
            {syncTestResult && (
              <div style={{ fontSize: '12px', background: 'var(--soft)', padding: '8px', borderRadius: '6px', marginTop: '4px' }}>
                {syncTestResult}
              </div>
            )}
          </div>
        )}

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
              <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#81766c' }}>公众号发布服务地址</label>
              <input
                type="url"
                value={wechatConfig.workerUrl}
                placeholder="https://wechat.example.com"
                onChange={(e) => handleWechatConfigChange({ workerUrl: e.target.value })}
                style={{ minHeight: '40px', padding: '0 8px', borderRadius: '6px', border: '1px solid var(--line)', background: 'var(--card2)', color: 'var(--text)' }}
              />
            </div>
            <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
              服务地址受管理员访问保护；AppID、Secret 和封面 media_id 仅保存在 Worker 密钥中。
            </div>
            <div style={{ display: 'grid', gap: '10px' }}>
              <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#81766c' }}>公众号提示词模板</div>
              {wechatPromptTemplates.map((template) => (
                <div key={template.id} style={{ display: 'grid', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 'bold' }}>{template.name}</label>
                  <textarea
                    value={template.prompt}
                    onChange={(event) => {
                      const next = wechatPromptTemplates.map((item) => (
                        item.id === template.id ? { ...item, prompt: event.target.value } : item
                      ))
                      setWechatPromptTemplates(next)
                      saveWechatPromptTemplates(next)
                    }}
                    style={{ minHeight: '88px' }}
                  />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" className="action primary" onClick={handleTestWechat} disabled={wechatTesting}>
                {wechatTesting ? '正在测试...' : '测试公众号连接'}
              </button>
              <button type="button" className="action" onClick={handleOpenWechatAuthorization}>
                重新授权
              </button>
            </div>
            {wechatTestResult && (
              <div style={{ fontSize: '12px', background: 'var(--soft)', padding: '8px', borderRadius: '6px' }}>
                {wechatTestResult}
              </div>
            )}
          </div>
        )}
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
            <div className="row-sub">脱敏导出 JSON 备份与合并式导入配置</div>
          </div>
          <div style={{ color: 'var(--muted)' }}>{activeCollapse === 'backup' ? '▼' : '›'}</div>
        </div>
        {activeCollapse === 'backup' && (
          <div style={{ padding: '12px 0', borderTop: '1px dashed var(--line)', display: 'grid', gap: '10px' }}>
            <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
              ⚠️ 安全提示：为了您的密钥安全，备份文件中不包含任何 API 密码与 FNS Token；公众号仅导出开关和服务地址。
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="action primary"
                onClick={handleExportBackup}
                style={{ padding: '10px' }}
              >
                📤 导出备份
              </button>
              <label
                className="action"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'var(--soft)',
                  cursor: 'pointer'
                }}
              >
                📥 导入备份
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImportBackup}
                  style={{ display: 'none' }}
                />
              </label>
            </div>
          </div>
        )}
      </section>

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
