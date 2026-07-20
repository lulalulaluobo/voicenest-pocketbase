migrate((app) => {
  return app.importCollections([{
    name: 'obsidian_tokens', type: 'base', system: false,
    fields: [
      { name: 'owner', type: 'relation', required: true, collectionId: '_pb_users_auth_', maxSelect: 1, cascadeDelete: true },
      { name: 'label', type: 'text', required: false, max: 128 },
      { name: 'tokenHash', type: 'text', required: true, max: 64 },
    ],
    indexes: ['CREATE UNIQUE INDEX idx_obsidian_tokens_hash ON obsidian_tokens (tokenHash)'],
    listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
  }], false)
}, (app) => {
  try { return app.delete(app.findCollectionByNameOrId('obsidian_tokens')) } catch (_) { return null }
})
