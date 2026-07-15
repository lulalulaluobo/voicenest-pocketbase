import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import { createFullBackup, readFullBackup, replaceLocalData } from './backup'
import { appendChunk, createRecording, getChunks, listRecordings, recordingDb } from './recording-db'

describe('full backup', () => {
  const values = new Map<string, string>()

  beforeEach(async () => {
    values.clear()
    vi.stubGlobal('localStorage', {
      get length() { return values.size },
      key: (index: number) => [...values.keys()][index] ?? null,
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
    })
    await recordingDb.delete()
    await recordingDb.open()
  })

  afterEach(async () => {
    await recordingDb.delete()
    vi.unstubAllGlobals()
  })

  it('round-trips settings, recordings, text and binary audio', async () => {
    localStorage.setItem('vn_asr', JSON.stringify({ apiKey: 'asr-secret' }))
    localStorage.setItem('vn_sync', JSON.stringify({ apiToken: 'obsidian-token' }))
    await createRecording({ id: 'r1', typeId: 'idea', typeName: '随想', mimeType: 'audio/webm', localTitle: '标题' })
    await recordingDb.recordings.update('r1', {
      transcript: '原始转写',
      summary: '# 整理文章',
      wechatStatus: 'drafted',
    })
    await appendChunk({
      id: 'c1',
      recordingId: 'r1',
      index: 0,
      createdAt: '2026-07-15T00:00:00.000Z',
      blob: new Blob(['audio-bytes'], { type: 'audio/webm' }),
      size: 11,
    })

    const archive = await createFullBackup()
    await recordingDb.recordings.clear()
    await recordingDb.audioChunks.clear()
    localStorage.setItem('vn_asr', JSON.stringify({ apiKey: 'wrong-key' }))
    localStorage.setItem('vn_current_only', 'remove-me')

    await replaceLocalData(await readFullBackup(archive))

    expect(localStorage.getItem('vn_asr')).toContain('asr-secret')
    expect(localStorage.getItem('vn_sync')).toContain('obsidian-token')
    expect(localStorage.getItem('vn_current_only')).toBeNull()
    expect(await listRecordings()).toMatchObject([{
      id: 'r1',
      transcript: '原始转写',
      summary: '# 整理文章',
      wechatStatus: 'drafted',
    }])
    expect(await (await getChunks('r1'))[0].blob.text()).toBe('audio-bytes')
  })

  it('rejects duplicate recording IDs before local data is replaced', async () => {
    await createRecording({ id: 'current', typeId: 'idea', typeName: '随想', mimeType: 'audio/webm', localTitle: '当前录音' })
    localStorage.setItem('vn_asr', 'current-setting')
    const archive = new Blob([zipSync({
      'manifest.json': strToU8(JSON.stringify({
        format: 'voicenest-backup',
        version: 2,
        exportedAt: '2026-07-15T00:00:00.000Z',
        recordingCount: 2,
        audioEntries: [],
      })),
      'settings.json': strToU8(JSON.stringify({ vn_asr: 'restored-setting' })),
      'recordings.json': strToU8(JSON.stringify([{ id: 'same' }, { id: 'same' }])),
    })])

    await expect(readFullBackup(archive)).rejects.toThrow('录音清单无效')

    expect((await listRecordings()).map((recording) => recording.id)).toEqual(['current'])
    expect(localStorage.getItem('vn_asr')).toBe('current-setting')
  })

  it('rejects recordings that are missing required fields', async () => {
    const archive = new Blob([zipSync({
      'manifest.json': strToU8(JSON.stringify({
        format: 'voicenest-backup',
        version: 2,
        exportedAt: '2026-07-15T00:00:00.000Z',
        recordingCount: 1,
        audioEntries: [],
      })),
      'settings.json': strToU8(JSON.stringify({})),
      'recordings.json': strToU8(JSON.stringify([{ id: 'incomplete' }])),
    })])

    await expect(readFullBackup(archive)).rejects.toThrow('录音清单无效')
  })

  it('restores a retained text record without audio chunks', async () => {
    await createRecording({ id: 'text-only', typeId: 'idea', typeName: '随想', mimeType: 'audio/webm', localTitle: '已清理音频' })
    await recordingDb.recordings.update('text-only', { isAudioCleared: true, transcript: '保留转写', summary: '# 保留文章' })

    const archive = await createFullBackup()
    await recordingDb.recordings.clear()
    await replaceLocalData(await readFullBackup(archive))

    expect(await getChunks('text-only')).toEqual([])
    expect(await listRecordings()).toMatchObject([{
      id: 'text-only',
      isAudioCleared: true,
      transcript: '保留转写',
      summary: '# 保留文章',
    }])
  })

  it('rejects recordings with an unknown processing status', async () => {
    const archive = new Blob([zipSync({
      'manifest.json': strToU8(JSON.stringify({
        format: 'voicenest-backup',
        version: 2,
        exportedAt: '2026-07-15T00:00:00.000Z',
        recordingCount: 1,
        audioEntries: [],
      })),
      'settings.json': strToU8(JSON.stringify({})),
      'recordings.json': strToU8(JSON.stringify([{
        id: 'unknown-status',
        createdAt: '2026-07-15T00:00:00.000Z',
        updatedAt: '2026-07-15T00:00:00.000Z',
        typeId: 'idea',
        typeName: '随想',
        durationMs: 0,
        mimeType: 'audio/webm',
        chunkIds: [],
        status: 'unknown',
        recovered: false,
        interrupted: false,
        localTitle: '错误状态',
      }])),
    })])

    await expect(readFullBackup(archive)).rejects.toThrow('录音清单无效')
  })
})
