import { pb } from './pocketbase'

export async function enqueueObsidianNote(sourceId: string, title: string, markdown: string, path: string): Promise<void> {
  if (!pb.authStore.model?.id) throw new Error('请先登录 VoiceNest 后端，再同步到 Obsidian。')
  await pb.send('/api/obsidian/queue', {
    method: 'POST',
    body: { sourceId, title, markdown, path },
  })
}

export async function getAcknowledgedObsidianSourceIds(sourceIds: string[]): Promise<string[]> {
  if (!pb.authStore.model?.id || !sourceIds.length) return []
  const response = await pb.send<{ sourceIds: string[] }>('/api/obsidian/sync/status', { query: { sourceIds: sourceIds.slice(0, 100).join(',') } })
  return response.sourceIds
}
