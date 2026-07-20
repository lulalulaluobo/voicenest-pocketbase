import { pb } from './pocketbase'

export async function enqueueObsidianNote(title: string, markdown: string, path: string): Promise<void> {
  if (!pb.authStore.model?.id) throw new Error('请先登录 VoiceNest 后端，再同步到 Obsidian。')
  await pb.collection('obsidian_notes').create({
    owner: pb.authStore.model.id,
    title,
    markdown,
    path,
  })
}
