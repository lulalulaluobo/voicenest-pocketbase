import { afterEach, beforeEach, expect, test, vi } from 'vitest'

const { pb } = vi.hoisted(() => ({
  pb: { baseUrl: 'https://voicenest.example.test', authStore: { token: 'user-token' } },
}))

vi.mock('./pocketbase', () => ({ pb }))

import { createObsidianSyncToken } from './obsidian-sync'

const originalFetch = globalThis.fetch

beforeEach(() => { globalThis.fetch = vi.fn() })
afterEach(() => { globalThis.fetch = originalFetch; vi.restoreAllMocks() })

test('shows the server Token limit message when creation is rejected', async () => {
  vi.mocked(globalThis.fetch).mockResolvedValueOnce({
    ok: false,
    json: async () => ({ code: 'TOKEN_LIMIT', message: '最多保留 3 个同步 Token，请先撤销旧 Token。' }),
  } as Response)

  await expect(createObsidianSyncToken()).rejects.toThrow('最多保留 3 个同步 Token，请先撤销旧 Token。')
})
