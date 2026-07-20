import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const homePage = readFileSync('src/pages/HomePage.tsx', 'utf8')
const styles = readFileSync('src/styles.css', 'utf8')

describe('home layout', () => {
  it('uses a fixed-height homepage without recent recordings', () => {
    expect(homePage).not.toContain('RecordingCard')
    expect(homePage).not.toContain('listRecordings')
    expect(homePage).toContain('className="view home-view"')
    expect(styles).toMatch(/\.home-view\s*\{[^}]*height:\s*100dvh;[^}]*overflow:\s*hidden;/s)
  })

  it('uses the main control for pause and resume, with confirmed cancellation', () => {
    expect(homePage).toContain("recorder.state === 'recording' ? '暂停录音'")
    expect(homePage).toContain("recorder.state === 'paused' ? '继续录音'")
    expect(homePage).toContain("window.confirm('取消本次录音？已录制的内容将不会保存。')")
    expect(homePage).toContain('>结束</button>')
    expect(homePage).toContain('>取消</button>')
  })
})
