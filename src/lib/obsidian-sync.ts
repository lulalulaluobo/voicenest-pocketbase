import { pb } from './pocketbase'

export async function createObsidianSyncToken(): Promise<string> {
  if (!pb.authStore.token) throw new Error('请先登录 VoiceNest 后端。')
  const baseUrl = new URL(pb.baseUrl).origin
  const response = await fetch(`${baseUrl}/api/obsidian/tokens`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${pb.authStore.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ label: 'Obsidian 插件' }),
  })
  if (!response.ok) throw new Error('无法生成同步 Token。')
  const data = await response.json() as { token?: string }
  if (!data.token) throw new Error('同步 Token 响应无效。')
  return data.token
}

export interface ObsidianSyncToken { id: string, label: string, created: string, lastUsedAt?: string }

export async function listObsidianSyncTokens(): Promise<ObsidianSyncToken[]> {
  const response = await fetch(`${pb.baseUrl}/api/obsidian/tokens`, { headers: { Authorization: `Bearer ${pb.authStore.token}` } })
  if (!response.ok) throw new Error('无法读取同步 Token。')
  return ((await response.json()) as { tokens?: ObsidianSyncToken[] }).tokens || []
}

export async function revokeObsidianSyncToken(id: string): Promise<void> {
  const response = await fetch(`${pb.baseUrl}/api/obsidian/tokens/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${pb.authStore.token}` } })
  if (!response.ok) throw new Error('无法撤销同步 Token。')
}
