import React, { useState } from 'react'
import { pb } from '../lib/pocketbase'

export function LoginPage({ onLoginSuccess }: { onLoginSuccess: () => void }) {
  const [isRegister, setIsRegister] = useState(false)
  const [identity, setIdentity] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      if (isRegister) {
        if (!username.trim()) {
          throw new Error('用户名不能为空')
        }
        if (password !== passwordConfirm) {
          throw new Error('两次输入的密码不一致')
        }
        await pb.collection('users').create({
          username: username.trim(),
          password,
          passwordConfirm,
        })
        // 注册成功后自动登录
        await pb.collection('users').authWithPassword(username.trim(), password)
      } else {
        if (!identity.trim()) {
          throw new Error('请输入用户名')
        }
        await pb.collection('users').authWithPassword(identity.trim(), password)
      }
      onLoginSuccess()
    } catch (err: any) {
      console.error(err)
      setError(err.message || '操作失败，请检查输入')
    } finally {
      setLoading(false)
    }
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
        <h2 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '8px', color: 'var(--text)' }}>
          VoiceNest
        </h2>
        <p style={{ color: 'var(--muted)', fontSize: '14px' }}>
          {isRegister ? '创建你的语音收件箱账号' : '登录以访问你的云端语音收件箱'}
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
            lineHeight: '1.4'
          }}>
            {error}
          </div>
        )}

        {isRegister ? (
          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500' }}>用户名</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              className="input-field"
              placeholder="例如 user123"
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
        ) : (
          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500' }}>用户名</label>
            <input
              type="text"
              value={identity}
              onChange={e => setIdentity(e.target.value)}
              required
              className="input-field"
              placeholder="请输入用户名"
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
        )}


        <div>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500' }}>密码</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            className="input-field"
            placeholder="请输入密码 (至少8位)"
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

        {isRegister && (
          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500' }}>确认密码</label>
            <input
              type="password"
              value={passwordConfirm}
              onChange={e => setPasswordConfirm(e.target.value)}
              required
              className="input-field"
              placeholder="请再次输入密码"
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
        )}

        <button
          type="submit"
          disabled={loading}
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
            opacity: loading ? 0.7 : 1,
            transition: 'opacity 0.2s'
          }}
        >
          {loading ? '处理中...' : isRegister ? '注册并登录' : '登 录'}
        </button>
      </form>

      <div style={{ textAlign: 'center', marginTop: '24px' }}>
        <button
          onClick={() => {
            setIsRegister(!isRegister)
            setError(null)
          }}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--muted)',
            fontSize: '14px',
            cursor: 'pointer',
            textDecoration: 'underline'
          }}
        >
          {isRegister ? '已有账号？立即登录' : '没有账号？立即注册'}
        </button>
      </div>
    </div>
  )
}
