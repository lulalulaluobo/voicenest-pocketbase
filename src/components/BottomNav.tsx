import { NavLink } from 'react-router-dom'
import type { MouseEvent } from 'react'

interface BottomNavProps {
  recordingActive: boolean
}

export function BottomNav({ recordingActive }: BottomNavProps) {
  const preventNavigation = (event: MouseEvent<HTMLAnchorElement>) => {
    if (recordingActive) event.preventDefault()
  }

  return (
    <nav className="bottom-nav" aria-label="主导航">
      <NavLink to="/" onClick={preventNavigation}><span aria-hidden="true">●</span>录音</NavLink>
      <NavLink to="/recordings" onClick={preventNavigation}><span aria-hidden="true">☷</span>列表</NavLink>
      <NavLink to="/settings" onClick={preventNavigation}><span aria-hidden="true">⚙</span>设置</NavLink>
      {recordingActive && <span className="nav-hint">请先完成录音</span>}
    </nav>
  )
}
