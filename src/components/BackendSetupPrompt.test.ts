import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'

test('提供免费公共后端的快捷入口', () => {
  const source = readFileSync('src/components/BackendSetupPrompt.tsx', 'utf8')

  expect(source).toContain("const PUBLIC_BACKEND_URL = 'https://voicenest.lucc.fun'")
  expect(source).toContain('使用免费公共后端')
})
