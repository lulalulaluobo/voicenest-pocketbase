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

export function App() {
  const recorder = useRecorder()
  const [restored, setRestored] = useState(false)
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW()

  useEffect(() => {
    void recoverIncompleteRecordings().finally(() => setRestored(true))
  }, [])

  if (!restored) return <main className="app-shell"><p className="empty-state">正在恢复本地录音…</p></main>

  return (
    <BrowserRouter>
      <main className="app-shell">
        <Routes>
          <Route path="/" element={<HomePage recorder={recorder} />} />
          <Route path="/recordings" element={<RecordingsPage />} />
          <Route path="/recordings/:recordingId" element={<RecordingDetailPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
        <BottomNav recordingActive={recorder.state !== 'idle'} />
        {needRefresh && recorder.state === 'idle' && (
          <button className="update-button" onClick={() => void updateServiceWorker()} type="button">发现新版本，点击更新</button>
        )}
      </main>
    </BrowserRouter>
  )
}
