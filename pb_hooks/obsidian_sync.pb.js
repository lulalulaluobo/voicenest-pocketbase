routerAdd('POST', '/api/obsidian/tokens', (e) => {
  const limited = require(`${__hooks}/wechat_helpers.js`).enforceRateLimit(e, 'obsidian-token', 3, 60)
  if (limited) return limited
  const body = e.requestInfo().body || {}
  const label = String(body.label || 'Obsidian 插件').trim().slice(0, 128)
  const existing = e.app.findRecordsByFilter('obsidian_tokens', 'owner = {:owner}', 'id', 4, 0, { owner: e.auth.id })
  if (existing.length >= 3) return e.json(429, { code: 'TOKEN_LIMIT', message: '最多保留 3 个同步 Token，请先撤销旧 Token。' })
  const rawToken = 'vn_' + $security.randomString(48)
  const record = new Record(e.app.findCollectionByNameOrId('obsidian_tokens'))
  record.set('owner', e.auth.id)
  record.set('label', label)
  record.set('tokenHash', $security.sha256(rawToken))
  e.app.save(record)
  return e.json(201, { id: record.id, token: rawToken, label: label })
}, $apis.requireAuth())

routerAdd('GET', '/api/obsidian/tokens', (e) => {
  const tokens = e.app.findRecordsByFilter('obsidian_tokens', 'owner = {:owner}', 'id', 3, 0, { owner: e.auth.id })
  return e.json(200, { tokens: tokens.map((token) => ({ id: token.id, label: token.get('label'), lastUsedAt: token.get('lastUsedAt') })) })
}, $apis.requireAuth())

routerAdd('DELETE', '/api/obsidian/tokens/{id}', (e) => {
  try {
    const token = e.app.findRecordById('obsidian_tokens', e.request.pathValue('id'))
    if (token.get('owner') !== e.auth.id) return e.json(404, { code: 'NOT_FOUND', message: '同步 Token 不存在。' })
    e.app.delete(token)
  } catch (_) { return e.json(404, { code: 'NOT_FOUND', message: '同步 Token 不存在。' }) }
  return e.json(204)
}, $apis.requireAuth())

routerAdd('POST', '/api/obsidian/queue', (e) => {
  const limited = require(`${__hooks}/wechat_helpers.js`).enforceRateLimit(e, 'obsidian-queue', 30, 60)
  if (limited) return limited
  require(`${__hooks}/obsidian_sync_helpers.js`).cleanupExpiredObsidianSync(e.app)
  const body = e.requestInfo().body || {}
  const sourceId = String(body.sourceId || '').trim()
  const title = String(body.title || '').trim()
  const markdown = String(body.markdown || '')
  const path = String(body.path || '').trim()
  if (!/^[a-zA-Z0-9-]{1,64}$/.test(sourceId) || !title || title.length > 255 || markdown.length > 131072 || path.length > 500) return e.json(400, { code: 'INVALID_NOTE', message: '同步笔记内容无效或过大。' })
  let note
  try { note = e.app.findFirstRecordByFilter('obsidian_notes', 'owner = {:owner} && sourceId = {:sourceId}', { owner: e.auth.id, sourceId: sourceId }) } catch (_) { note = null }
  if (!note) {
    const pending = e.app.findRecordsByFilter('obsidian_notes', 'owner = {:owner}', 'id', 101, 0, { owner: e.auth.id })
    if (pending.length >= 100) return e.json(429, { code: 'QUEUE_LIMIT', message: '待同步笔记已达 100 条，请先启动 Obsidian 插件同步。' })
    note = new Record(e.app.findCollectionByNameOrId('obsidian_notes'))
    note.set('owner', e.auth.id); note.set('sourceId', sourceId)
  }
  note.set('title', title); note.set('markdown', markdown); note.set('path', path); note.set('queuedAt', new Date().toISOString())
  try { e.app.delete(e.app.findFirstRecordByFilter('obsidian_sync_receipts', 'owner = {:owner} && sourceId = {:sourceId}', { owner: e.auth.id, sourceId: sourceId })) } catch (_) {}
  e.app.save(note)
  return e.json(200, { id: note.id, sourceId: sourceId })
}, $apis.requireAuth())

routerAdd('GET', '/api/obsidian/sync/status', (e) => {
  const raw = String(e.requestInfo().query.sourceIds || '')
  const sourceIds = raw.split(',').filter((id) => /^[a-zA-Z0-9-]{1,64}$/.test(id)).slice(0, 100)
  const synced = []
  for (const sourceId of sourceIds) {
    try { e.app.findFirstRecordByFilter('obsidian_sync_receipts', 'owner = {:owner} && sourceId = {:sourceId}', { owner: e.auth.id, sourceId: sourceId }); synced.push(sourceId) } catch (_) {}
  }
  return e.json(200, { sourceIds: synced })
}, $apis.requireAuth())

routerAdd('GET', '/api/obsidian/sync/changes', (e) => {
  const owner = require(`${__hooks}/obsidian_sync_helpers.js`).requireToken(e); if (!owner) return
  require(`${__hooks}/obsidian_sync_helpers.js`).cleanupExpiredObsidianSync(e.app)
  const requested = Number(e.requestInfo().query.limit || 50)
  const limit = Number.isSafeInteger(requested) && requested >= 1 && requested <= 200 ? requested : 50
  const notes = e.app.findRecordsByFilter('obsidian_notes', 'owner = {:owner} && syncedAt = ""', 'id', limit, 0, { owner: owner })
  const items = notes.map((note) => ({ id: note.id, sourceId: note.get('sourceId'), title: note.get('title'), markdown: note.get('markdown'), path: note.get('path') }))
  const last = items.length ? items[items.length - 1].id : String(e.requestInfo().query.cursor || '')
  return e.json(200, { notes: items, last_id: last })
})

routerAdd('POST', '/api/obsidian/sync/ack', (e) => {
  const owner = require(`${__hooks}/obsidian_sync_helpers.js`).requireToken(e); if (!owner) return
  const body = e.requestInfo().body || {}
  const ids = Array.isArray(body.noteIds) ? body.noteIds.slice(0, 200) : []
  let acked = 0
  for (const id of ids) {
    if (typeof id !== 'string') continue
    try {
      const note = e.app.findRecordById('obsidian_notes', id)
      if (note.get('owner') !== owner) continue
      let receipt
      try { receipt = e.app.findFirstRecordByFilter('obsidian_sync_receipts', 'owner = {:owner} && sourceId = {:sourceId}', { owner: owner, sourceId: note.get('sourceId') }) } catch (_) { receipt = new Record(e.app.findCollectionByNameOrId('obsidian_sync_receipts')); receipt.set('owner', owner); receipt.set('sourceId', note.get('sourceId')) }
      receipt.set('ackedAt', new Date().toISOString()); e.app.save(receipt); e.app.delete(note); acked++
    } catch (_) {}
  }
  return e.json(200, { acked: acked })
})
