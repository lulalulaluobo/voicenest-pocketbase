import { beforeEach, expect, test, vi } from 'vitest'

const { send, pb } = vi.hoisted(() => {
  const send = vi.fn()
  return { send, pb: { authStore: { model: { id: 'user-1' } as { id: string } | null }, send } }
})
vi.mock('./pocketbase', () => ({ pb }))

import { enqueueObsidianNote } from './obsidian-queue'

beforeEach(() => {
  send.mockReset()
  pb.authStore.model = { id: 'user-1' }
})

test('queues a completed note through the idempotent backend endpoint', async () => {
  await enqueueObsidianNote('recording-1', '标题', '# 内容', 'Inbox')

  expect(send).toHaveBeenCalledWith('/api/obsidian/queue', {
    method: 'POST',
    body: { sourceId: 'recording-1', title: '标题', markdown: '# 内容', path: 'Inbox' },
  })
})

test('refuses to queue notes without a signed-in user', async () => {
  pb.authStore.model = null
  await expect(enqueueObsidianNote('recording-1', '标题', '# 内容', 'Inbox')).rejects.toThrow('请先登录')
})
