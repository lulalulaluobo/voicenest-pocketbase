import { describe, expect, it, vi } from 'vitest'
import { syncProcessedNote } from './sync-targets'

const input = {
  recordingId: 'recording-1',
  title: '今日感想',
  markdown: '# 今日感想\n\n正文',
  obsidianDir: 'Inbox/Ideas',
  obsidianConfig: { api: 'https://fast-note.example', apiToken: 'token', vault: 'vault' },
  wechatConfig: { enabled: true, workerUrl: 'https://wechat-api.lucc.fun' },
  wechatRequestId: 'request-1'
}

describe('syncProcessedNote', () => {
  it('keeps target results independent when Obsidian fails', async () => {
    const syncToObsidian = vi.fn().mockRejectedValue(new Error('Obsidian unavailable'))
    const publishWechatDraft = vi.fn().mockResolvedValue({ mediaId: 'draft-1', reused: false })

    const result = await syncProcessedNote(input, { syncToObsidian, publishWechatDraft })

    expect(result.obsidian).toMatchObject({ ok: false, error: 'Obsidian unavailable' })
    expect(result.wechat).toMatchObject({ ok: true, mediaId: 'draft-1' })
    expect(syncToObsidian).toHaveBeenCalledOnce()
    expect(publishWechatDraft).toHaveBeenCalledOnce()
  })

  it('skips unconfigured Obsidian without blocking WeChat', async () => {
    const syncToObsidian = vi.fn()
    const publishWechatDraft = vi.fn().mockResolvedValue({ mediaId: 'draft-1', reused: false })

    const result = await syncProcessedNote({
      ...input,
      obsidianConfig: { api: 'http://localhost:8080', apiToken: '', vault: '' }
    }, { syncToObsidian, publishWechatDraft })

    expect(result.obsidian).toBeUndefined()
    expect(result.wechat).toMatchObject({ ok: true, mediaId: 'draft-1' })
    expect(syncToObsidian).not.toHaveBeenCalled()
  })
})
