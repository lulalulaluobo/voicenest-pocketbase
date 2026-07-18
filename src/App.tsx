import { useEffect, useState } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { Capacitor } from '@capacitor/core'
import { BottomNav } from './components/BottomNav'
import { useRecorder } from './hooks/use-recorder'
import { recoverIncompleteRecordings } from './lib/recording-db'
import { HomePage } from './pages/HomePage'
import { RecordingDetailPage } from './pages/RecordingDetailPage'
import { RecordingsPage } from './pages/RecordingsPage'
import { SettingsPage } from './pages/SettingsPage'
import { WechatEditorPage } from './pages/WechatEditorPage'
import { useProcessor } from './hooks/use-processor'
import { LoginPage } from './components/LoginPage'
import { BackendSetupPrompt } from './components/BackendSetupPrompt'
import { pb, isPocketbaseUrlConfigured } from './lib/pocketbase'

import { syncSettingsFromCloud } from './lib/config-store'

import { sweepExpiredStorage } from './lib/retention'

function ServiceWorkerUpdate({ canUpdate }: { canUpdate: boolean }) {
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW()

  if (!needRefresh || !canUpdate) return null

  return <button className="update-button" onClick={() => void updateServiceWorker()} type="button">发现新版本，点击更新</button>
}

export function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(pb.authStore.isValid)
  // APK 首次启动时若未配置后端地址，强制显示后端配置引导。
  // 浏览器（PWA）走同源部署，isPocketbaseUrlConfigured() 始终为 true。
  const [backendReady, setBackendReady] = useState(isPocketbaseUrlConfigured())
  const recorder = useRecorder()
  const [restored, setRestored] = useState(false)
  const { processQueue } = useProcessor()

  useEffect(() => {
    // 监听 authStore 变化以更新状态
    const unsubscribe = pb.authStore.onChange(() => {
      setIsLoggedIn(pb.authStore.isValid)
    })
    return () => unsubscribe()
  }, [])

  useEffect(() => {
    if (!isLoggedIn) return
    void syncSettingsFromCloud()
      .then(() => recoverIncompleteRecordings())
      .then(() => void sweepExpiredStorage())
      .finally(() => setRestored(true))
  }, [isLoggedIn])

  // 当恢复录音库完毕且网络在线时，自动对积压的离线同步队列触发消费整理一次
  useEffect(() => {
    if (isLoggedIn && restored) {
      void processQueue()
    }
  }, [isLoggedIn, restored, processQueue])

  // 后端地址未配置（主要是 APK 首次启动）：优先显示后端配置引导
  if (!backendReady) {
    return (
      <div className="phone" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <BackendSetupPrompt onConfigured={() => setBackendReady(true)} />
      </div>
    )
  }

  if (!isLoggedIn) {
    return (
      <div className="phone" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <LoginPage onLoginSuccess={() => setIsLoggedIn(true)} />
      </div>
    )
  }

  if (!restored) return <div className="phone" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><p className="empty-state">正在恢复本地录音…</p></div>

  return (
    <BrowserRouter>
      <div className="phone">
        <Routes>
          <Route path="/" element={<HomePage recorder={recorder} />} />
          <Route path="/recordings" element={<RecordingsPage />} />
          <Route path="/recordings/:recordingId" element={<RecordingDetailPage />} />
          <Route path="/recordings/:recordingId/wechat" element={<WechatEditorPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
        <BottomNav recordingActive={recorder.state !== 'idle'} />
        {!Capacitor.isNativePlatform() && <ServiceWorkerUpdate canUpdate={recorder.state === 'idle'} />}
      </div>
    </BrowserRouter>
  )
}

