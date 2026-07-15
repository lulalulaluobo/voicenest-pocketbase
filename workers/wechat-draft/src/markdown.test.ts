import { describe, expect, it } from 'vitest'
import { renderWechatHtml } from './markdown'

describe('renderWechatHtml', () => {
  it('renders the supported markdown with inline styles', () => {
    const html = renderWechatHtml('# 今日感想\n\n- 第一条')

    expect(html).toContain('<h1 style=')
    expect(html).toContain('<li style=')
  })

  it('renders every reading block with WeChat-friendly inline styles', () => {
    const html = renderWechatHtml('# 标题\n\n## 小节\n\n- 项目\n- 第二项\n\n1. 第一步\n\n> 引用\n\n---\n\n[链接](https://example.com)')

    expect(html).toContain('<ul style=')
    expect(html).toContain('<ol style=')
    expect(html).toContain('<li style=')
    expect(html).toContain('<blockquote style=')
    expect(html).toContain('<hr style=')
    expect(html).toContain('<a href="https://example.com" style=')
  })

  it('escapes raw HTML instead of passing it to WeChat', () => {
    const html = renderWechatHtml('<script>alert(1)</script>')

    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })
})
