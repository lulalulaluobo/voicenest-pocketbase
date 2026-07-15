import MarkdownIt from 'markdown-it'

const markdown = new MarkdownIt({ html: false, linkify: true })

const blockStyles: Record<string, string> = {
  h1: 'font-size:24px;font-weight:700;line-height:1.5;margin:24px 0 16px;',
  h2: 'font-size:20px;font-weight:700;line-height:1.5;margin:20px 0 12px;',
  p: 'font-size:16px;line-height:1.85;margin:0 0 14px;color:#1f2329;',
  blockquote: 'margin:16px 0;padding:8px 14px;border-left:3px solid #576b95;color:#57606a;',
  pre: 'padding:12px;overflow:auto;background:#f6f8fa;border-radius:6px;'
}

markdown.renderer.rules.heading_open = (tokens, index) => {
  const tag = tokens[index].tag
  return `<${tag} style="${blockStyles[tag]}">`
}

markdown.renderer.rules.paragraph_open = (tokens, index) =>
  tokens[index].hidden ? '' : `<p style="${blockStyles.p}">`
markdown.renderer.rules.blockquote_open = () => `<blockquote style="${blockStyles.blockquote}">`
markdown.renderer.rules.fence = (tokens, index) => {
  const content = markdown.utils.escapeHtml(tokens[index].content)
  return `<pre style="${blockStyles.pre}"><code>${content}</code></pre>\n`
}

export function renderWechatHtml(source: string): string {
  return markdown.render(source.trim())
}
