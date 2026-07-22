import PocketBase from 'pocketbase'
import { Capacitor } from '@capacitor/core'

// PocketBase 后端地址解析策略：
//   1. 优先读 localStorage 中的 vn_pocketbase_url（用户在设置页或首次引导时配置）
//   2. Web 浏览器（PWA）：未配置时降级用 window.location.origin（与前端同源部署）
//   3. APK（Capacitor 原生）：未配置时返回空字符串，由 App 层强制弹出后端地址配置引导；
//      因为 APK 的 window.location.origin 是 https://localhost，那里没有 PocketBase。
//
// 同源部署背景：Dockerfile 把 dist/ 复制到 PocketBase 的 pb_public，
// 所以浏览器访问 PocketBase 域名时同时拿到前端 PWA 和 API。
const POCKETBASE_URL_KEY = 'vn_pocketbase_url'

function detectInitialEndpoint(): string {
  // 兼容 SSR / 测试环境（vitest node 环境）：localStorage / window / Capacitor 均不可用时降级
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem(POCKETBASE_URL_KEY)
    if (stored) {
      try {
        const normalized = new URL(stored).origin
        localStorage.setItem(POCKETBASE_URL_KEY, normalized)
        return normalized
      } catch {
        localStorage.removeItem(POCKETBASE_URL_KEY)
      }
    }
  }

  // Capacitor.isNativePlatform() 在 APK 内为 true，在浏览器内为 false
  // 测试环境（vitest）中 Capacitor 模块可加载但返回 false，走 window 分支
  if (typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform && Capacitor.isNativePlatform()) {
    // APK 必须显式配置后端地址，否则请求会发到 https://localhost 失败
    return ''
  }

  // Web：PocketBase 同时托管前端，window.location.origin 即后端地址
  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    return window.location.origin
  }

  // 测试 / SSR 环境：返回占位，测试代码会 mock fetch 或不实际请求
  return 'http://127.0.0.1:8090'
}

export const pb = new PocketBase(detectInitialEndpoint())

export function getPocketbaseUrl(): string {
  return pb.baseUrl
}

export function isPocketbaseUrlConfigured(): boolean {
  return Boolean(pb.baseUrl)
}

export function isAllowedPocketbaseUrl(url: URL): boolean {
  if (url.protocol === 'https:') return true
  return url.protocol === 'http:' && ['localhost', '127.0.0.1', '10.0.2.2'].includes(url.hostname)
}

// 用户配置后端地址后调用：写入 localStorage 持久化，并实时更新 SDK 的 baseUrl
export function setPocketbaseUrl(url: string): void {
  const normalized = url.trim().replace(/\/+$/, '')
  if (normalized) {
    const parsed = new URL(normalized)
    if (!isAllowedPocketbaseUrl(parsed)) throw new Error('后端地址必须使用 HTTPS；仅本地开发地址允许 HTTP。')
    pb.authStore.clear()
    localStorage.setItem(POCKETBASE_URL_KEY, normalized)
    pb.baseUrl = normalized
  } else {
    localStorage.removeItem(POCKETBASE_URL_KEY)
    pb.baseUrl = detectInitialEndpoint()
  }
}
