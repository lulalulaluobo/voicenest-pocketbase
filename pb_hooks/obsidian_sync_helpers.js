function requireToken(e) {
  const authorization = e.request.header.get('Authorization') || ''
  if (!authorization.startsWith('Bearer vn_')) {
    e.json(401, { code: 'UNAUTHORIZED', message: '同步 Token 无效或已撤销。' })
    return null
  }
  try {
    const token = e.app.findFirstRecordByFilter('obsidian_tokens', 'tokenHash = {:hash}', { hash: $security.sha256(authorization.slice(7)) })
    token.set('lastUsedAt', new Date().toISOString())
    e.app.save(token)
    return token.get('owner') || null
  } catch (_) {
    e.json(401, { code: 'UNAUTHORIZED', message: '同步 Token 无效或已撤销。' })
    return null
  }
}

function cleanupExpiredObsidianSync(app) {
  const queueCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const receiptCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  for (const record of app.findRecordsByFilter('obsidian_notes', 'queuedAt < {:cutoff}', 'id', 500, 0, { cutoff: queueCutoff })) app.delete(record)
  for (const record of app.findRecordsByFilter('obsidian_sync_receipts', 'ackedAt < {:cutoff}', 'id', 500, 0, { cutoff: receiptCutoff })) app.delete(record)
}

module.exports = { requireToken: requireToken, cleanupExpiredObsidianSync: cleanupExpiredObsidianSync }
