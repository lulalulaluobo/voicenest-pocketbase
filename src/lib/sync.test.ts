import { afterEach, expect, test, vi } from 'vitest'
import { testSyncConnection } from './sync'

afterEach(() => {
  vi.unstubAllGlobals()
})

test('FNS 测试通过同源 PocketBase 转发，浏览器不直连 FNS', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ status: true }),
  }))

  await expect(testSyncConnection({
    api: 'https://fns.example.com',
    apiToken: 'token',
    vault: 'obsidian',
  })).resolves.toBeUndefined()

  expect(fetch).toHaveBeenCalledWith('http://127.0.0.1:8090/api/fns/connection-test', expect.objectContaining({
    method: 'POST',
    body: JSON.stringify({ api: 'https://fns.example.com', apiToken: 'token' }),
  }))
})

test('同源转发不可达时提示检查 VoiceNest 后端', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

  await expect(testSyncConnection({
    api: 'https://fns.example.com',
    apiToken: 'token',
    vault: 'obsidian',
  })).rejects.toThrow('无法连接 VoiceNest 后端，请检查登录状态和网络')
})

test('FNS 返回鉴权范围错误时透传明确原因', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ status: false, message: 'Auth token Scope restricted' }),
  }))

  await expect(testSyncConnection({
    api: 'https://fns.example.com',
    apiToken: 'token',
    vault: 'obsidian',
  })).rejects.toThrow('鉴权失败: Auth token Scope restricted')
})
