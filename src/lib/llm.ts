export interface LLMConfig {
  endpoint: string
  apiKey: string
  model: string
  timeoutMs?: number
}

export interface NoteTypeConfig {
  name: string
  prompt: string
  template: string
}

export async function formatNote(
  transcript: string,
  typeConfig: NoteTypeConfig,
  llmConfig: LLMConfig
): Promise<{ title: string; markdown: string }> {
  const systemPrompt = `你是一个智能笔记整理助手。请将用户的口语原始转写文本整理成结构化的 Markdown 笔记。
你必须严格返回一个 JSON 对象，不要包含 markdown 标记或任何 json 之外的解释，格式如下：
{
  "title": "笔记标题（基于转写内容生成）",
  "markdown": "基于所选模板生成的 Markdown 内容"
}`

  const userContent = `【当前笔记类型】：${typeConfig.name}
【笔记整理提示词】：${typeConfig.prompt}
【Markdown 模板结构】：\n${typeConfig.template}

【原始转写文本】：
"""
${transcript}
"""

请按模板和类型提示词生成结果：`

  const url = `${llmConfig.endpoint.replace(/\/+$/, '')}/chat/completions`
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), llmConfig.timeoutMs || 30000)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${llmConfig.apiKey}`
      },
      body: JSON.stringify({
        model: llmConfig.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent }
        ],
        response_format: { type: 'json_object' }
      }),
      signal: controller.signal
    })
    clearTimeout(timeoutId)

    if (!response.ok) {
      throw new Error(`LLM API 调用失败 (${response.status})`)
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content || ''
    
    const parsed = JSON.parse(content.trim())
    if (!parsed.title || !parsed.markdown) {
      throw new Error('LLM 响应缺失必需的 title 或 markdown 属性。')
    }
    return parsed
  } catch (err: any) {
    clearTimeout(timeoutId)
    throw err
  }
}
