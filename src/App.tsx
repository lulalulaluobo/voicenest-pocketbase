import { useEffect, useState } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { BottomNav } from './components/BottomNav'
import { useRecorder } from './hooks/use-recorder'
import { recoverIncompleteRecordings } from './lib/recording-db'
import { HomePage } from './pages/HomePage'
import { RecordingDetailPage } from './pages/RecordingDetailPage'
import { RecordingsPage } from './pages/RecordingsPage'
import { SettingsPage } from './pages/SettingsPage'
import { WechatEditorPage } from './pages/WechatEditorPage'
import { useProcessor } from './hooks/use-processor'

import { sweepExpiredStorage } from './lib/retention'

export function App() {
  const recorder = useRecorder()
  const [restored, setRestored] = useState(false)
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW()
  
  const { processQueue } = useProcessor()

  useEffect(() => {
    void recoverIncompleteRecordings()
      .then(() => void sweepExpiredStorage())
      .finally(() => setRestored(true))
  }, [])

  // 当恢复录音库完毕且网络在线时，自动对积压的离线同步队列触发消费整理一次
  useEffect(() => {
    if (restored) {
      void processQueue()
    }
  }, [restored, processQueue])

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
        {needRefresh && recorder.state === 'idle' && (
          <button className="update-button" onClick={() => void updateServiceWorker()} type="button">发现新版本，点击更新</button>
        )}
      </div>
    </BrowserRouter>
  )
}
