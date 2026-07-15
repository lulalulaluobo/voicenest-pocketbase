import { describe, expect, it } from 'vitest'
import { renderWechatHtml } from './markdown'

describe('renderWechatHtml', () => {
  it('renders the supported markdown with inline styles', () => {
    const html = renderWechatHtml('# 今日感想\n\n- 第一条')

    expect(html).toContain('<h1 style=')
    expect(html).toContain('<li>第一条</li>')
  })

  it('escapes raw HTML instead of passing it to WeChat', () => {
    const html = renderWechatHtml('<script>alert(1)</script>')

    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })
})
