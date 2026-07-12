import { NavLink } from 'react-router-dom'
import type { MouseEvent } from 'react'

interface BottomNavProps {
  recordingActive: boolean
}

/* 录音：实心圆点 */
function IconRecord({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r={active ? 7 : 6.5} fill="currentColor" />
    </svg>
  )
}

/* 列表：三横线带圆点 */
function IconList() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="9" y1="6" x2="20" y2="6" />
      <line x1="9" y1="12" x2="20" y2="12" />
      <line x1="9" y1="18" x2="20" y2="18" />
      <circle cx="5" cy="6" r="1" fill="currentColor" stroke="none" />
      <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="5" cy="18" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

/* 设置：齿轮 */
function IconSettings() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  )
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
        end
      >
        {({ isActive }) => (
          <>
            <IconRecord active={isActive} />
            录音
          </>
        )}
      </NavLink>
      <NavLink
        to="/recordings"
        onClick={preventNavigation}
        className={({ isActive }) => `nav-btn ${isActive ? 'active' : ''}`}
      >
        <IconList />
        列表
      </NavLink>
      <NavLink
        to="/settings"
        onClick={preventNavigation}
        className={({ isActive }) => `nav-btn ${isActive ? 'active' : ''}`}
      >
        <IconSettings />
        设置
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
