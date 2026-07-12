export default async function handler(req, res) {
  // Allow cross-origin requests and preserve custom headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, token')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  const targetUrl = req.query.url
  if (!targetUrl) {
    return res.status(400).json({ error: 'Missing target url parameter' })
  }

  try {
    const headers = {
      'Content-Type': 'application/json'
    }
    
    // Transfer the custom token authentication header
    if (req.headers.token) {
      headers['token'] = req.headers.token
    }

    const fetchOptions = {
      method: req.method,
      headers
    }

    // Pass down request body if available
    if (req.method === 'POST' && req.body) {
      fetchOptions.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
    }

    const response = await fetch(targetUrl, fetchOptions)
    const responseData = await response.text()

    res.status(response.status).send(responseData)
  } catch (error) {
    res.status(500).json({ error: `Vercel Proxy error: ${error.message}` })
  }
}
