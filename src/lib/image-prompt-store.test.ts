import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { deleteImagePromptTemplate, listImagePromptTemplates, saveImagePromptTemplate } from './image-prompt-store'
import { recordingDb } from './recording-db'

describe('image prompt store', () => {
  beforeEach(async () => {
    await recordingDb.delete()
    await recordingDb.open()
  })

  afterEach(async () => {
    await recordingDb.delete()
  })

  it('persists a prompt template together with an optional PNG reference image', async () => {
    await saveImagePromptTemplate({
      id: 'cover-1',
      name: '自然随笔',
      prompt: '留白摄影感的横版封面',
      referenceImage: new Blob(['png'], { type: 'image/png' }),
      referenceImageMimeType: 'image/png'
    })

    await expect(listImagePromptTemplates()).resolves.toMatchObject([{
      id: 'cover-1',
      name: '自然随笔',
      referenceImageMimeType: 'image/png'
    }])

    await deleteImagePromptTemplate('cover-1')
    await expect(listImagePromptTemplates()).resolves.toEqual([])
  })
})
