import { beforeEach, expect, test, vi } from 'vitest'

const { create, pb } = vi.hoisted(() => {
  const create = vi.fn()
  return { create, pb: { authStore: { model: { id: 'user-1' } as { id: string } | null }, collection: vi.fn(() => ({ create })) } }
})
vi.mock('./pocketbase', () => ({ pb }))

import { enqueueObsidianNote } from './obsidian-queue'

beforeEach(() => {
  create.mockReset()
  pb.collection.mockClear()
  pb.authStore.model = { id: 'user-1' }
})

test('queues a completed note for the signed-in user', async () => {
  await enqueueObsidianNote('标题', '# 内容', 'Inbox')

  expect(pb.collection).toHaveBeenCalledWith('obsidian_notes')
  expect(create).toHaveBeenCalledWith({ owner: 'user-1', title: '标题', markdown: '# 内容', path: 'Inbox' })
})

test('refuses to queue notes without a signed-in user', async () => {
  pb.authStore.model = null
  await expect(enqueueObsidianNote('标题', '# 内容', 'Inbox')).rejects.toThrow('请先登录')
})
