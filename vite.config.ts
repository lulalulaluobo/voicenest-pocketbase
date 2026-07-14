import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  resolve: {
    // 使用 ts-ebml 的浏览器构建，避免普通构建生成无效的 WebM 元数据。
    alias: { 'ts-ebml': 'ts-ebml/dist/EBML.js' },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      manifest: {
        name: '声笺',
        short_name: '声笺',
        description: '本地优先的语音收件箱',
        display: 'standalone',
        theme_color: '#f5f6f8',
        background_color: '#f5f6f8',
        icons: [
          {
            src: 'icon.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
  },
})
