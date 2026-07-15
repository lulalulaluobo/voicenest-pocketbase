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

  it('removes empty list markers before rendering article lists', () => {
    const html = renderWechatHtml('- 有内容的项目\n-\n- 第二个项目\n\n1. 第一个编号\n2.\n3. 第二个编号')

    expect(html).not.toMatch(/<li[^>]*>\s*<\/li>/)
    expect((html.match(/<li style=/g) || [])).toHaveLength(4)
  })

  it('uses compact paragraph and list spacing for WeChat reading', () => {
    const html = renderWechatHtml('正文\n\n- 列表')

    expect(html).toContain('margin:0 0 14px;font-size:16px;line-height:1.75')
    expect(html).toContain('margin:0 0 14px;padding-left:1.5em;')
  })
})
