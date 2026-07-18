import { useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { setPocketbaseUrl } from '../lib/pocketbase'

const PUBLIC_BACKEND_URL = 'https://voicenest.lucc.fun'

// APK 首次启动时的后端地址配置引导。
// 浏览器（PWA）走同源部署，不需要此组件；仅在 Capacitor 原生环境 + 未配置地址时显示。
export function BackendSetupPrompt({ onConfigured }: { onConfigured: () => void }) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)

  const verifyAndSave = async (value: string) => {
    setError(null)
    const trimmed = value.trim().replace(/\/+$/, '')

    if (!trimmed) {
      setError('请输入 PocketBase 后端地址')
      return
    }

    let parsed: URL
    try {
      parsed = new URL(trimmed)
    } catch {
      setError('地址格式无效，请输入完整的 URL，例如 http://10.0.2.2:8090')
      return
    }

    setTesting(true)
    try {
      // 探测后端健康度：访问 /api/health，PocketBase 内置的健康检查端点
      const res = await fetch(`${parsed.origin}/api/health`)
      if (!res.ok) {
        throw new Error(`后端响应异常（HTTP ${res.status}）`)
      }
      setPocketbaseUrl(parsed.origin)
      onConfigured()
    } catch (err: any) {
      setError(`无法连接到后端：${err.message}。请检查地址是否正确、服务是否启动、HTTPS 证书是否受信任。`)
    } finally {
      setTesting(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    void verifyAndSave(url)
  }

  const handleUsePublicBackend = () => {
    setUrl(PUBLIC_BACKEND_URL)
    void verifyAndSave(PUBLIC_BACKEND_URL)
  }

  return (
    <div className="login-container" style={{
      padding: '24px',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      minHeight: '100%',
      background: 'var(--bg)',
      color: 'var(--text)'
    }}>
      <div style={{ textAlign: 'center', marginBottom: '32px' }}>
        <h2 style={{ fontSize: '26px', fontWeight: '700', marginBottom: '8px' }}>
          配置后端地址
        </h2>
        <p style={{ color: 'var(--muted)', fontSize: '14px', lineHeight: 1.6 }}>
          {Capacitor.isNativePlatform() ? 'App' : '本应用'} 需要连接你自己部署的 PocketBase 后端。
          <br />请填入后端的 HTTPS 访问地址。
        </p>
      </div>

      <form onSubmit={handleSubmit} style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        background: 'var(--card)',
        padding: '24px',
        borderRadius: 'var(--radius)',
        boxShadow: 'var(--shadow)'
      }}>
        {error && (
          <div style={{
            background: 'var(--dangerBg)',
            color: 'var(--danger)',
            padding: '12px 16px',
            borderRadius: '12px',
            fontSize: '14px',
            lineHeight: 1.4
          }}>
            {error}
          </div>
        )}

        <div>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500' }}>
            PocketBase 后端地址
          </label>
          <input
            type="url"
            value={url}
            onChange={e => setUrl(e.target.value)}
            required
            className="input-field"
            placeholder="https://voicenest.example.com"
            style={{
              width: '100%',
              padding: '12px 16px',
              borderRadius: '12px',
              border: '1px solid var(--line)',
              background: 'var(--soft)',
              color: 'var(--text)',
              fontSize: '15px'
            }}
          />
        </div>

        <button
          type="submit"
          disabled={testing}
          style={{
            marginTop: '12px',
            width: '100%',
            padding: '14px',
            borderRadius: '14px',
            border: 'none',
            background: 'var(--accent)',
            color: 'var(--accentText)',
            fontSize: '16px',
            fontWeight: '600',
            cursor: 'pointer',
            opacity: testing ? 0.7 : 1,
            transition: 'opacity 0.2s'
          }}
        >
          {testing ? '正在验证连接…' : '验证并保存'}
        </button>
        <button
          type="button"
          onClick={handleUsePublicBackend}
          disabled={testing}
          className="action"
          style={{ width: '100%', padding: '12px' }}
        >
          使用免费公共后端
        </button>
      </form>

      <p style={{
        color: 'var(--muted)',
        fontSize: '12px',
        lineHeight: 1.6,
        marginTop: '20px',
        textAlign: 'center'
      }}>
        公共后端可直接体验，也可随时改为你自己的后端地址。
        <br />地址只保存在本机，可在「设置 → 后端地址」中修改。
      </p>
    </div>
  )
}
