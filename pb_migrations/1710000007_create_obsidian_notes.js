migrate((app) => {
  return app.importCollections([{
    name: 'obsidian_notes',
    type: 'base',
    system: false,
    fields: [
      { name: 'owner', type: 'relation', required: true, collectionId: '_pb_users_auth_', maxSelect: 1, cascadeDelete: true },
      { name: 'title', type: 'text', required: true, max: 255 },
      { name: 'markdown', type: 'editor', required: true, maxSize: 0 },
      { name: 'path', type: 'text', required: false, max: 500 },
      { name: 'syncedAt', type: 'date', required: false },
    ],
    indexes: [],
    listRule: 'owner = @request.auth.id',
    viewRule: 'owner = @request.auth.id',
    createRule: 'owner = @request.auth.id',
    updateRule: 'owner = @request.auth.id',
    deleteRule: 'owner = @request.auth.id',
  }], false)
}, (app) => {
  try {
    return app.delete(app.findCollectionByNameOrId('obsidian_notes'))
  } catch (_) {
    return null
  }
})
