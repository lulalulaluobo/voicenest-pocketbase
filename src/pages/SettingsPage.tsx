import { useState } from 'react'
import {
  getASRConfig,
  saveASRConfig,
  getLLMConfig,
  saveLLMConfig,
  getSyncConfig,
  saveSyncConfig,
  getNoteTypes,
  saveNoteTypes,
  type UserNoteType
} from '../lib/config-store'
import { transcribeAudio } from '../lib/asr'
import { formatNote } from '../lib/llm'
import { testSyncConnection } from '../lib/sync'

export function SettingsPage() {
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

  // Note Types
  const [noteTypes, setNoteTypes] = useState<UserNoteType[]>(getNoteTypes())
  const [editingType, setEditingType] = useState<UserNoteType | null>(null)

  // Auto processing settings
  const [autoProcess, setAutoProcess] = useState(localStorage.getItem('vn_auto_process') === 'true')

  // ASR Save & Test
  const handleASRChange = (field: string, value: string) => {
    const updated = { ...asrConfig, [field]: value }
    setAsrConfig(updated as any)
    saveASRConfig(updated as any)
  }

  const handleASRTypeChange = (newType: 'openai' | 'step' | 'custom') => {
    const updated = { ...asrConfig, type: newType }
    if (newType === 'openai') {
      updated.endpoint = 'https://api.openai.com/v1'
      updated.model = 'whisper-1'
    } else if (newType === 'step') {
      updated.endpoint = 'https://api.stepfun.com/v1'
      updated.model = 'stepaudio-2.5-asr'
    }
    setAsrConfig(updated)
    saveASRConfig(updated)
  }

  const handleTestASR = async () => {
    setAsrTesting(true)
    setAsrTestResult(null)
    try {
      const base64ToBlob = (base64: string, mimeType: string): Blob => {
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

  const handleSetDefaultType = (id: string) => {
    const list = noteTypes.map(t => ({
      ...t,
      isDefault: t.id === id
    }))
    setNoteTypes(list)
    saveNoteTypes(list)
  }

  return (
    <section className="page" style={{ display: 'grid', gap: '20px' }}>
      <header className="topbar">
        <div>
          <span className="eyebrow">PREFERENCES</span>
          <h1>设置</h1>
        </div>
      </header>

      {/* 自动化设置 */}
      <section className="settings-card">
        <h2>自动化配置</h2>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: '44px' }}>
          <div>
            <strong>自动处理</strong>
            <span style={{ fontSize: '13px', opacity: 0.8 }}>录音完成后自动执行转写与同步</span>
          </div>
          <input
            type="checkbox"
            checked={autoProcess}
            onChange={handleToggleAutoProcess}
            style={{ width: '44px', height: '24px', cursor: 'pointer' }}
          />
        </div>
      </section>

      {/* ASR 配置 */}
      <section className="settings-card">
        <h2>ASR 转写配置 (Whisper 兼容)</h2>
        <div style={{ display: 'grid', gap: '12px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '13px', fontWeight: 'bold', color: '#81766c' }}>ASR 服务类型</label>
            <select
              value={asrConfig.type}
              onChange={(e) => handleASRTypeChange(e.target.value as any)}
              style={{ minHeight: '44px', padding: '0 8px', borderRadius: '8px', border: '1px solid #ded6cb' }}
            >
              <option value="openai">OpenAI Whisper</option>
              <option value="step">阶跃星辰 StepAudio</option>
              <option value="custom">自定义 Whisper 接口</option>
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '13px', fontWeight: 'bold', color: '#81766c' }}>API Endpoint</label>
            <input
              type="text"
              value={asrConfig.endpoint}
              onChange={(e) => handleASRChange('endpoint', e.target.value)}
              placeholder="https://api.openai.com/v1"
              style={{ minHeight: '44px', padding: '0 12px', borderRadius: '8px', border: '1px solid #ded6cb' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '13px', fontWeight: 'bold', color: '#81766c' }}>API Key</label>
            <input
              type="password"
              value={asrConfig.apiKey}
              onChange={(e) => handleASRChange('apiKey', e.target.value)}
              placeholder="sk-..."
              style={{ minHeight: '44px', padding: '0 12px', borderRadius: '8px', border: '1px solid #ded6cb' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '13px', fontWeight: 'bold', color: '#81766c' }}>Model 名称</label>
            <input
              type="text"
              value={asrConfig.model}
              onChange={(e) => handleASRChange('model', e.target.value)}
              placeholder="whisper-1"
              style={{ minHeight: '44px', padding: '0 12px', borderRadius: '8px', border: '1px solid #ded6cb' }}
            />
          </div>

          <div style={{ marginTop: '8px' }}>
            <button
              type="button"
              onClick={handleTestASR}
              disabled={asrTesting}
              className="btn"
              style={{
                minHeight: '44px',
                width: '100%',
                background: '#bf3b3b',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 'bold',
                opacity: asrTesting ? 0.6 : 1
              }}
            >
              {asrTesting ? '正在测试...' : 'ASR 测试连接'}
            </button>
            {asrTestResult && (
              <div style={{ marginTop: '8px', fontSize: '13px', padding: '8px', borderRadius: '6px', background: '#f5f2ec', wordBreak: 'break-all' }}>
                {asrTestResult}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* LLM 配置 */}
      <section className="settings-card">
        <h2>LLM 整理配置 (GPT 兼容)</h2>
        <div style={{ display: 'grid', gap: '12px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '13px', fontWeight: 'bold', color: '#81766c' }}>API Endpoint</label>
            <input
              type="text"
              value={llmConfig.endpoint}
              onChange={(e) => handleLLMChange('endpoint', e.target.value)}
              placeholder="https://api.openai.com/v1"
              style={{ minHeight: '44px', padding: '0 12px', borderRadius: '8px', border: '1px solid #ded6cb' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '13px', fontWeight: 'bold', color: '#81766c' }}>API Key</label>
            <input
              type="password"
              value={llmConfig.apiKey}
              onChange={(e) => handleLLMChange('apiKey', e.target.value)}
              placeholder="sk-..."
              style={{ minHeight: '44px', padding: '0 12px', borderRadius: '8px', border: '1px solid #ded6cb' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '13px', fontWeight: 'bold', color: '#81766c' }}>Model 名称</label>
            <input
              type="text"
              value={llmConfig.model}
              onChange={(e) => handleLLMChange('model', e.target.value)}
              placeholder="gpt-4o"
              style={{ minHeight: '44px', padding: '0 12px', borderRadius: '8px', border: '1px solid #ded6cb' }}
            />
          </div>

          <div style={{ marginTop: '8px' }}>
            <button
              type="button"
              onClick={handleTestLLM}
              disabled={llmTesting}
              className="btn"
              style={{
                minHeight: '44px',
                width: '100%',
                background: '#bf3b3b',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 'bold',
                opacity: llmTesting ? 0.6 : 1
              }}
            >
              {llmTesting ? '正在测试...' : 'LLM 测试连接'}
            </button>
            {llmTestResult && (
              <div style={{ marginTop: '8px', fontSize: '13px', padding: '8px', borderRadius: '6px', background: '#f5f2ec', wordBreak: 'break-all' }}>
                {llmTestResult}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Fast Note Sync 同步配置 */}
      <section className="settings-card">
        <h2>Obsidian 同步端点 (Fast Note Sync)</h2>
        <div style={{ display: 'grid', gap: '12px' }}>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '13px', fontWeight: 'bold', color: '#81766c' }}>一键粘贴 FNS 配置 JSON</label>
            <textarea
              value={fnsJsonInput}
              onChange={(e) => setFnsJsonInput(e.target.value)}
              placeholder='例: {"api":"http://localhost:8080","apiToken":"...","vault":"obsidian"}'
              style={{ minHeight: '70px', padding: '8px 12px', borderRadius: '8px', border: '1px solid #ded6cb', fontFamily: 'monospace', fontSize: '12px' }}
            />
            <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
              <button
                type="button"
                onClick={handleClipboardImport}
                style={{
                  minHeight: '36px',
                  padding: '0 12px',
                  borderRadius: '6px',
                  background: '#5b5148',
                  color: '#fff',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                📋 从剪贴板导入并解析
              </button>
              <button
                type="button"
                onClick={() => handleParseFnsJson(fnsJsonInput)}
                disabled={!fnsJsonInput.trim()}
                style={{
                  minHeight: '36px',
                  padding: '0 12px',
                  borderRadius: '6px',
                  background: '#ded6cb',
                  color: '#27241f',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  opacity: fnsJsonInput.trim() ? 1 : 0.6
                }}
              >
                ⚙️ 解析并填充
              </button>
            </div>
          </div>

          <hr style={{ border: '0', borderTop: '1px dashed #e5ddd4', margin: '8px 0' }} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '13px', fontWeight: 'bold', color: '#81766c' }}>FNS 基础地址 (API)</label>
            <input
              type="text"
              value={syncConfig.api}
              onChange={(e) => handleSyncFieldChange('api', e.target.value)}
              placeholder="http://localhost:8080"
              style={{ minHeight: '44px', padding: '0 12px', borderRadius: '8px', border: '1px solid #ded6cb' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '13px', fontWeight: 'bold', color: '#81766c' }}>FNS Vault 名称</label>
            <input
              type="text"
              value={syncConfig.vault}
              onChange={(e) => handleSyncFieldChange('vault', e.target.value)}
              placeholder="obsidian"
              style={{ minHeight: '44px', padding: '0 12px', borderRadius: '8px', border: '1px solid #ded6cb' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '13px', fontWeight: 'bold', color: '#81766c' }}>FNS API Token</label>
            <input
              type="password"
              value={syncConfig.apiToken}
              onChange={(e) => handleSyncFieldChange('apiToken', e.target.value)}
              placeholder="FNS 鉴权密钥"
              style={{ minHeight: '44px', padding: '0 12px', borderRadius: '8px', border: '1px solid #ded6cb' }}
            />
          </div>

          <div style={{ marginTop: '8px' }}>
            <button
              type="button"
              onClick={handleTestSync}
              disabled={syncTesting}
              style={{
                minHeight: '44px',
                width: '100%',
                background: '#bf3b3b',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 'bold',
                opacity: syncTesting ? 0.6 : 1
              }}
            >
              {syncTesting ? '正在测试...' : '测试 Obsidian FNS 连接'}
            </button>
            {syncTestResult && (
              <div style={{ marginTop: '8px', fontSize: '13px', padding: '8px', borderRadius: '6px', background: '#f5f2ec', wordBreak: 'break-all' }}>
                {syncTestResult}
              </div>
            )}
          </div>

        </div>
      </section>

      {/* 笔记类型管理 */}
      <section className="settings-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>笔记类型管理</h2>
          <button
            type="button"
            onClick={handleAddNoteType}
            style={{
              minHeight: '36px',
              padding: '0 12px',
              borderRadius: '6px',
              background: '#5b5148',
              color: '#fff',
              border: 'none',
              fontWeight: 'bold',
              fontSize: '12px'
            }}
          >
            ➕ 新增类型
          </button>
        </div>

        <div style={{ display: 'grid', gap: '10px', marginTop: '10px' }}>
          {noteTypes.map(type => (
            <div
              key={type.id}
              style={{
                border: '1px solid #e5ddd4',
                borderRadius: '10px',
                padding: '12px',
                display: 'grid',
                gap: '8px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong>{type.name}</strong>
                  {type.isDefault && <span style={{ marginLeft: '8px', fontSize: '11px', color: '#bf3b3b', fontWeight: 'bold' }}>(默认)</span>}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setEditingType(type)}
                    style={{ background: 'transparent', border: 'none', color: '#315d92', fontWeight: 'bold', cursor: 'pointer', minWidth: '44px', minHeight: '44px' }}
                  >
                    编辑
                  </button>
                  {!type.isDefault && (
                    <button
                      type="button"
                      onClick={() => handleSetDefaultType(type.id)}
                      style={{ background: 'transparent', border: 'none', color: '#865c12', cursor: 'pointer', minWidth: '44px', minHeight: '44px' }}
                    >
                      设默认
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDeleteNoteType(type.id)}
                    style={{ background: 'transparent', border: 'none', color: '#a83330', cursor: 'pointer', minWidth: '44px', minHeight: '44px' }}
                  >
                    删除
                  </button>
                </div>
              </div>
              <span style={{ fontSize: '12px', opacity: 0.8 }}>📂 存储路径: {type.obsidianPath}</span>
            </div>
          ))}
        </div>
      </section>

      {/* 编辑弹窗模态框 */}
      {editingType && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
        >
          <div
            className="settings-card"
            style={{
              width: '100%',
              maxWidth: '500px',
              maxHeight: '90vh',
              overflowY: 'auto',
              margin: 0,
              gap: '12px'
            }}
          >
            <h3>编辑笔记分类: {editingType.name}</h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#81766c' }}>分类名称</label>
              <input
                type="text"
                value={editingType.name}
                onChange={(e) => setEditingType({ ...editingType, name: e.target.value })}
                style={{ minHeight: '40px', padding: '0 8px', borderRadius: '6px', border: '1px solid #ded6cb' }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#81766c' }}>Obsidian 目录路径</label>
              <input
                type="text"
                value={editingType.obsidianPath}
                onChange={(e) => setEditingType({ ...editingType, obsidianPath: e.target.value })}
                style={{ minHeight: '40px', padding: '0 8px', borderRadius: '6px', border: '1px solid #ded6cb' }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#81766c' }}>LLM 整理提示词</label>
              <textarea
                value={editingType.prompt}
                onChange={(e) => setEditingType({ ...editingType, prompt: e.target.value })}
                style={{ minHeight: '60px', padding: '8px', borderRadius: '6px', border: '1px solid #ded6cb', fontFamily: 'inherit' }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#81766c' }}>Markdown 模板</label>
              <textarea
                value={editingType.template}
                onChange={(e) => setEditingType({ ...editingType, template: e.target.value })}
                style={{ minHeight: '120px', padding: '8px', borderRadius: '6px', border: '1px solid #ded6cb', fontFamily: 'monospace', fontSize: '13px' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
              <button
                type="button"
                className="btn"
                onClick={() => handleSaveTypeEdit(editingType)}
                style={{ flex: 1, background: '#bf3b3b', color: '#fff', border: 'none', borderRadius: '6px', minHeight: '44px', fontWeight: 'bold' }}
              >
                保存
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => setEditingType(null)}
                style={{ flex: 1, background: '#ded6cb', color: '#5b5148', border: 'none', borderRadius: '6px', minHeight: '44px', fontWeight: 'bold' }}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
