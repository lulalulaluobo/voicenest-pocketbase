migrate((app) => {
  const notes = app.findCollectionByNameOrId('obsidian_notes')
  if (notes) {
    notes.fields.add(new Field({ name: 'sourceId', type: 'text', required: false, max: 64 }))
    for (let i = 0; i < notes.fields.length; i++) {
      if (notes.fields[i].name === 'markdown') { notes.fields[i].type = 'text'; notes.fields[i].max = 524288 }
    }
    notes.listRule = null; notes.viewRule = null; notes.createRule = null; notes.updateRule = null; notes.deleteRule = null
    app.save(notes)
    const legacy = app.findRecordsByFilter('obsidian_notes', 'sourceId = ""', 'id', 5000, 0)
    for (const note of legacy) { note.set('sourceId', 'legacy-' + note.id); app.save(note) }
    for (let i = 0; i < notes.fields.length; i++) if (notes.fields[i].name === 'sourceId') notes.fields[i].required = true
    notes.indexes = [...(notes.indexes || []), 'CREATE UNIQUE INDEX idx_obsidian_notes_owner_source ON obsidian_notes (owner, sourceId)']
    app.save(notes)
  }
  const tokens = app.findCollectionByNameOrId('obsidian_tokens')
  if (tokens) { tokens.fields.add(new Field({ name: 'lastUsedAt', type: 'date', required: false })); app.save(tokens) }
  return app.importCollections([{
    name: 'obsidian_sync_receipts', type: 'base', system: false,
    fields: [
      { name: 'owner', type: 'relation', required: true, collectionId: '_pb_users_auth_', maxSelect: 1, cascadeDelete: true },
      { name: 'sourceId', type: 'text', required: true, max: 64 },
      { name: 'ackedAt', type: 'date', required: true },
    ],
    indexes: ['CREATE UNIQUE INDEX idx_obsidian_receipts_owner_source ON obsidian_sync_receipts (owner, sourceId)'],
    listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
  }], false)
}, (app) => {
  try { return app.delete(app.findCollectionByNameOrId('obsidian_sync_receipts')) } catch (_) { return null }
})
