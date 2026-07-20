function requireToken(e) {
  const authorization = e.request.header.get('Authorization') || ''
  if (!authorization.startsWith('Bearer vn_')) {
    e.json(401, { code: 'UNAUTHORIZED', message: '同步 Token 无效或已撤销。' })
    return null
  }
  try {
    const token = e.app.findFirstRecordByFilter('obsidian_tokens', 'tokenHash = {:hash}', { hash: $security.sha256(authorization.slice(7)) })
    return token.get('owner') || null
  } catch (_) {
    e.json(401, { code: 'UNAUTHORIZED', message: '同步 Token 无效或已撤销。' })
    return null
  }
}

module.exports = { requireToken: requireToken }
