migrate((app) => {
  const notes = app.findCollectionByNameOrId('obsidian_notes')
  let hasQueuedAt = false
  for (let i = 0; i < notes.fields.length; i++) if (notes.fields[i].name === 'queuedAt') hasQueuedAt = true
  if (!hasQueuedAt) {
    notes.fields.add(new Field({ name: 'queuedAt', type: 'date', required: false }))
    app.save(notes)
  }
  for (const note of app.findRecordsByFilter('obsidian_notes', 'queuedAt = ""', 'id', 5000, 0)) {
    note.set('queuedAt', new Date().toISOString())
    app.save(note)
  }
})
