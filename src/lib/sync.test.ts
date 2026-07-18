import { afterEach, expect, test, vi } from 'vitest'
import { testSyncConnection } from './sync'

afterEach(() => {
  vi.unstubAllGlobals()
})

test('FNS 请求被浏览器拦截时提示检查 HTTPS 与 CORS', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

  await expect(testSyncConnection({
    api: 'https://fns.example.com',
    apiToken: 'token',
    vault: 'obsidian',
  })).rejects.toThrow('请检查 FNS 是否使用 HTTPS，并允许应用来源 https://localhost 跨域访问')
})
