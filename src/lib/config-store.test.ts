import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getASRConfig, getNoteTypes } from './config-store'

describe('config store', () => {
  const values = new Map<string, string>()

  beforeEach(() => {
    values.clear()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    })
  })

  afterEach(() => vi.unstubAllGlobals())

  it('falls back to defaults when saved JSON is malformed', () => {
    values.set('vn_asr', '{not-json')
    values.set('vn_note_types', '{not-json')

    expect(getASRConfig().model).toBe('whisper-1')
    expect(getNoteTypes()).toHaveLength(4)
  })
})
