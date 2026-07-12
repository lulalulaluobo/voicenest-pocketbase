import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 允许任何源跨域访问该代理，并允许传递 token 头部
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, token')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  const targetUrl = req.query.url as string
  if (!targetUrl) {
    return res.status(400).json({ error: 'Missing target url parameter' })
  }

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    }
    
    // 提取并传递自定义的 token 鉴权头
    if (req.headers.token) {
      headers['token'] = req.headers.token as string
    }

    const fetchOptions: RequestInit = {
      method: req.method,
      headers
    }

    // 转发 POST 请求的 body 数据
    if (req.method === 'POST' && req.body) {
      fetchOptions.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
    }

    const response = await fetch(targetUrl, fetchOptions)
    const responseData = await response.text()

    // 转发状态码和目标服务器响应
    res.status(response.status).send(responseData)
  } catch (error: any) {
    res.status(500).json({ error: `Vercel Proxy error: ${error.message}` })
  }
}
