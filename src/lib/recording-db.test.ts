import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  appendChunk,
  createRecording,
  deleteRecording,
  getChunks,
  getRecording,
  listRecordings,
  recordingDb,
  recoverIncompleteRecordings,
} from './recording-db'

const draft = {
  id: 'recording-1',
  typeId: 'idea',
  typeName: '随想',
  mimeType: 'audio/webm',
  localTitle: '2026-07-12 随想',
}

const chunk = {
  id: 'chunk-1',
  recordingId: draft.id,
  index: 0,
  createdAt: '2026-07-12T00:00:05.000Z',
  blob: new Blob(['audio'], { type: draft.mimeType }),
  size: 5,
}

describe('recording database', () => {
  beforeEach(async () => {
    await recordingDb.delete()
    await recordingDb.open()
  })

  afterEach(async () => {
    await recordingDb.delete()
  })

  it('restores an unfinished recording without losing persisted chunks', async () => {
    await createRecording(draft)
    await appendChunk(chunk)

    await recoverIncompleteRecordings()

    expect((await getRecording(draft.id))?.status).toBe('recovered')
    expect(await getChunks(draft.id)).toHaveLength(1)
  })

  it('deletes a recording and every owned chunk', async () => {
    await createRecording(draft)
    await appendChunk(chunk)

    await deleteRecording(draft.id)

    expect(await getRecording(draft.id)).toBeUndefined()
    expect(await getChunks(draft.id)).toHaveLength(0)
  })

  it('lists recordings from newest to oldest', async () => {
    await recordingDb.recordings.bulkAdd([
      {
        ...draft,
        id: 'older',
        createdAt: '2026-07-12T00:00:00.000Z',
        updatedAt: '2026-07-12T00:00:00.000Z',
        durationMs: 0,
        chunkIds: [],
        status: 'ready',
        recovered: false,
        interrupted: false,
      },
      {
        ...draft,
        id: 'newer',
        createdAt: '2026-07-12T00:01:00.000Z',
        updatedAt: '2026-07-12T00:01:00.000Z',
        durationMs: 0,
        chunkIds: [],
        status: 'ready',
        recovered: false,
        interrupted: false,
      },
    ])

    expect((await listRecordings()).map((recording) => recording.id)).toEqual(['newer', 'older'])
  })

  it('reads chunks in their recording order', async () => {
    await createRecording(draft)
    await appendChunk({ ...chunk, id: 'chunk-2', index: 2 })
    await appendChunk({ ...chunk, id: 'chunk-1', index: 1 })

    expect((await getChunks(draft.id)).map((item) => item.index)).toEqual([1, 2])
  })

  it('supports transcript, summary and errorMessage fields', async () => {
    await createRecording(draft)
    await recordingDb.recordings.update(draft.id, {
      transcript: '这是原始转写文本',
      summary: '# 标题\n这是 LLM 整理文本',
      errorMessage: '网络连接失败'
    })

    const updated = await getRecording(draft.id)
    expect(updated?.transcript).toBe('这是原始转写文本')
    expect(updated?.summary).toBe('# 标题\n这是 LLM 整理文本')
    expect(updated?.errorMessage).toBe('网络连接失败')
  })

  it('persists WeChat draft synchronization fields', async () => {
    await createRecording(draft)
    await recordingDb.recordings.update(draft.id, {
      wechatStatus: 'drafted',
      wechatDraftMediaId: 'draft-media-id',
      wechatRequestId: 'request-id',
      wechatTitle: '公众号标题',
      wechatMarkdown: '# 公众号标题\n\n正文'
    })

    const updated = await getRecording(draft.id)
    expect(updated?.wechatStatus).toBe('drafted')
    expect(updated?.wechatDraftMediaId).toBe('draft-media-id')
    expect(updated?.wechatRequestId).toBe('request-id')
    expect(updated?.wechatTitle).toBe('公众号标题')
    expect(updated?.wechatMarkdown).toBe('# 公众号标题\n\n正文')
  })

  it('persists a generated WeChat cover on its recording', async () => {
    await createRecording(draft)
    await recordingDb.recordings.update(draft.id, {
      wechatCoverBlob: new Blob(['png'], { type: 'image/png' }),
      wechatCoverMimeType: 'image/png'
    })

    const updated = await getRecording(draft.id)
    expect(updated?.wechatCoverBlob).toBeInstanceOf(Blob)
    expect(updated?.wechatCoverMimeType).toBe('image/png')
  })
})
