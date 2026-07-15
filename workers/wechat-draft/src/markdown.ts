import MarkdownIt from 'markdown-it'

const markdown = new MarkdownIt({ html: false, linkify: true })

const blockStyles: Record<string, string> = {
  h1: 'margin:0 0 28px;font-size:24px;line-height:1.45;font-weight:700;color:#1f2329;',
  h2: 'margin:34px 0 16px;padding-left:10px;border-left:4px solid #07c160;font-size:20px;line-height:1.5;font-weight:700;color:#1f2329;',
  h3: 'margin:26px 0 12px;font-size:17px;line-height:1.6;font-weight:700;color:#1f2329;',
  p: 'margin:0 0 18px;font-size:16px;line-height:1.9;color:#2c2c2c;letter-spacing:0.02em;',
  ul: 'margin:0 0 18px;padding-left:1.5em;',
  ol: 'margin:0 0 18px;padding-left:1.6em;',
  li: 'margin:0 0 8px;font-size:16px;line-height:1.85;color:#2c2c2c;',
  blockquote: 'margin:20px 0;padding:12px 16px;border-left:4px solid #07c160;background:#f6fbf7;color:#57606a;',
  hr: 'margin:30px 0;border:0;border-top:1px solid #e7e7e7;',
  pre: 'margin:20px 0;padding:14px;overflow:auto;border-radius:6px;background:#f6f8fa;'
}

const linkStyle = 'color:#576b95;text-decoration:underline;'

markdown.renderer.rules.heading_open = (tokens, index) => {
  const tag = tokens[index].tag
  return `<${tag} style="${blockStyles[tag]}">`
}

markdown.renderer.rules.paragraph_open = (tokens, index) =>
  tokens[index].hidden ? '' : `<p style="${blockStyles.p}">`
markdown.renderer.rules.bullet_list_open = () => `<ul style="${blockStyles.ul}">`
markdown.renderer.rules.ordered_list_open = () => `<ol style="${blockStyles.ol}">`
markdown.renderer.rules.list_item_open = () => `<li style="${blockStyles.li}">`
markdown.renderer.rules.blockquote_open = () => `<blockquote style="${blockStyles.blockquote}">`
markdown.renderer.rules.hr = () => `<hr style="${blockStyles.hr}">\n`
markdown.renderer.rules.link_open = (tokens, index, options, _env, self) => {
  tokens[index].attrSet('style', linkStyle)
  return self.renderToken(tokens, index, options)
}
markdown.renderer.rules.strong_open = () => '<strong style="font-weight:700;color:#1f2329;">'
markdown.renderer.rules.fence = (tokens, index) => {
  const content = markdown.utils.escapeHtml(tokens[index].content)
  return `<pre style="${blockStyles.pre}"><code>${content}</code></pre>\n`
}

export function renderWechatHtml(source: string): string {
  return markdown.render(source.trim())
}
