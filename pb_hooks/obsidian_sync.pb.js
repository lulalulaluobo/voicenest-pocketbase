routerAdd('POST', '/api/obsidian/tokens', (e) => {
  const body = e.requestInfo().body || {}
  const label = String(body.label || 'Obsidian 插件').trim().slice(0, 128)
  const rawToken = 'vn_' + $security.randomString(48)
  const record = new Record(e.app.findCollectionByNameOrId('obsidian_tokens'))
  record.set('owner', e.auth.id)
  record.set('label', label)
  record.set('tokenHash', $security.sha256(rawToken))
  e.app.save(record)
  return e.json(201, { id: record.id, token: rawToken, label: label })
}, $apis.requireAuth())

routerAdd('GET', '/api/obsidian/sync/changes', (e) => {
  const owner = require(`${__hooks}/obsidian_sync_helpers.js`).requireToken(e); if (!owner) return
  const requested = Number(e.requestInfo().query.limit || 50)
  const limit = Number.isSafeInteger(requested) && requested >= 1 && requested <= 200 ? requested : 50
  const notes = e.app.findRecordsByFilter('obsidian_notes', 'owner = {:owner} && syncedAt = ""', 'created,id', limit, 0, { owner: owner })
  const items = notes.map((note) => ({ id: note.id, title: note.get('title'), markdown: note.get('markdown'), path: note.get('path'), created: note.get('created') }))
  const last = items.length ? `${items[items.length - 1].created}|${items[items.length - 1].id}` : String(e.requestInfo().query.cursor || '')
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
      if (note.get('owner') !== owner || note.get('syncedAt')) continue
      note.set('syncedAt', new Date().toISOString())
      e.app.save(note); acked++
    } catch (_) {}
  }
  return e.json(200, { acked: acked })
})
