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
})
