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
      <NavLink
        to="/"
        onClick={preventNavigation}
        className={({ isActive }) => `nav-btn ${isActive ? 'active' : ''}`}
      >
        <span aria-hidden="true">●</span>录音
      </NavLink>
      <NavLink
        to="/recordings"
        onClick={preventNavigation}
        className={({ isActive }) => `nav-btn ${isActive ? 'active' : ''}`}
      >
        <span aria-hidden="true">☷</span>列表
      </NavLink>
      <NavLink
        to="/settings"
        onClick={preventNavigation}
        className={({ isActive }) => `nav-btn ${isActive ? 'active' : ''}`}
      >
        <span aria-hidden="true">⚙</span>设置
      </NavLink>
      {recordingActive && (
        <span 
          className="nav-hint" 
          style={{ 
            position: 'absolute', 
            top: '-32px', 
            left: '50%', 
            transform: 'translateX(-50%)', 
            borderRadius: '999px', 
            background: 'var(--accent)', 
            color: 'var(--accentText)', 
            padding: '5px 12px', 
            fontSize: '11px', 
            fontWeight: 'bold',
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 10px rgba(0,0,0,0.1)'
          }}
        >
          请先完成当前录音
        </span>
      )}
    </nav>
  )
}
