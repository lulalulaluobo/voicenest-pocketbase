import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import type { AudioChunk, Recording } from '../domain/recording'
import { recordingDb } from './recording-db'

export const BACKUP_FORMAT = 'voicenest-backup'
export const BACKUP_VERSION = 2

const RECORDING_STATUSES = new Set([
  'recording',
  'ready',
  'recovered',
  'interrupted',
  'waiting_network',
  'processing',
  'synced',
  'failed',
])

const WECHAT_DRAFT_STATUSES = new Set([
  'idle',
  'syncing',
  'drafted',
  'failed',
  'authorization_required',
])

interface AudioEntry {
  path: string
  id: string
  recordingId: string
  index: number
  createdAt: string
  size: number
  type: string
}

export interface BackupManifest {
  format: typeof BACKUP_FORMAT
  version: typeof BACKUP_VERSION
  exportedAt: string
  recordingCount: number
  audioEntries: AudioEntry[]
}

export interface FullBackup {
  manifest: BackupManifest
  settings: Record<string, string>
  recordings: Recording[]
  chunks: AudioChunk[]
}

function vnSettings(): Record<string, string> {
  const entries: Array<[string, string]> = []
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index)
    if (key?.startsWith('vn_')) entries.push([key, localStorage.getItem(key) ?? ''])
  }
  return Object.fromEntries(entries)
}

function jsonFile(value: unknown): Uint8Array {
  return strToU8(JSON.stringify(value))
}

function parseJson<T>(files: Record<string, Uint8Array>, path: string): T {
  const file = files[path]
  if (!file) throw new Error(`备份缺少 ${path}`)
  return JSON.parse(strFromU8(file)) as T
}

function isAudioEntry(value: unknown): value is AudioEntry {
  if (!value || typeof value !== 'object') return false
  const entry = value as Partial<AudioEntry>
  return typeof entry.path === 'string'
    && typeof entry.id === 'string'
    && typeof entry.recordingId === 'string'
    && typeof entry.createdAt === 'string'
    && typeof entry.type === 'string'
    && typeof entry.index === 'number' && Number.isSafeInteger(entry.index) && entry.index >= 0
    && typeof entry.size === 'number' && Number.isSafeInteger(entry.size) && entry.size >= 0
}

function validateManifest(value: unknown): asserts value is BackupManifest {
  if (!value || typeof value !== 'object') throw new Error('备份清单无效')
  const manifest = value as Partial<BackupManifest>
  if (manifest.format !== BACKUP_FORMAT) {
    throw new Error('不支持的备份格式')
  }
  const version = manifest.version as number | undefined
  if (version !== 1 && version !== 2) {
    throw new Error('不支持的备份版本')
  }
  if (typeof manifest.recordingCount !== 'number' || !Number.isSafeInteger(manifest.recordingCount)
    || manifest.recordingCount < 0 || !Array.isArray(manifest.audioEntries)) {
    throw new Error('备份清单无效')
  }
  if (!manifest.audioEntries.every(isAudioEntry)) throw new Error('备份音频清单无效')
}

function isRecording(value: unknown): value is Recording {
  if (!value || typeof value !== 'object') return false
  const recording = value as Partial<Recording>
  return typeof recording.id === 'string'
    && typeof recording.createdAt === 'string'
    && typeof recording.updatedAt === 'string'
    && (recording.typeId === undefined || typeof recording.typeId === 'string')
    && (recording.typeName === undefined || typeof recording.typeName === 'string')
    && typeof recording.durationMs === 'number' && Number.isFinite(recording.durationMs) && recording.durationMs >= 0
    && typeof recording.mimeType === 'string'
    && Array.isArray(recording.chunkIds) && recording.chunkIds.every((id) => typeof id === 'string')
    && typeof recording.status === 'string' && RECORDING_STATUSES.has(recording.status)
    && (recording.recovered === undefined || typeof recording.recovered === 'boolean')
    && (recording.interrupted === undefined || typeof recording.interrupted === 'boolean')
    && (recording.localTitle === undefined || typeof recording.localTitle === 'string')
    && (recording.transcript === undefined || typeof recording.transcript === 'string')
    && (recording.summary === undefined || typeof recording.summary === 'string')
    && (recording.errorMessage === undefined || typeof recording.errorMessage === 'string')
    && (recording.isAudioCleared === undefined || typeof recording.isAudioCleared === 'boolean')
    && (recording.wechatStatus === undefined || WECHAT_DRAFT_STATUSES.has(recording.wechatStatus))
    && (recording.wechatDraftMediaId === undefined || typeof recording.wechatDraftMediaId === 'string')
    && (recording.wechatErrorMessage === undefined || typeof recording.wechatErrorMessage === 'string')
    && (recording.wechatRequestId === undefined || typeof recording.wechatRequestId === 'string')
    && (recording.wechatTitle === undefined || typeof recording.wechatTitle === 'string')
    && (recording.wechatMarkdown === undefined || typeof recording.wechatMarkdown === 'string')
}

export async function createFullBackup(): Promise<Blob> {
  const recordings = await recordingDb.recordings.toArray()
  const chunks = await recordingDb.audioChunks.toArray()
  const audioEntries: AudioEntry[] = []
  const files: Record<string, Uint8Array> = {
    'settings.json': jsonFile(vnSettings()),
    'recordings.json': jsonFile(recordings),
  }

  for (const chunk of chunks) {
    const path = `audio/${chunk.recordingId}/${chunk.id}.bin`
    audioEntries.push({
      path,
      id: chunk.id,
      recordingId: chunk.recordingId,
      index: chunk.index,
      createdAt: chunk.createdAt,
      size: chunk.size,
      type: chunk.blob.type,
    })
    files[path] = new Uint8Array(await chunk.blob.arrayBuffer())
  }

  const manifest: BackupManifest = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    recordingCount: recordings.length,
    audioEntries,
  }
  files['manifest.json'] = jsonFile(manifest)
  return new Blob([zipSync(files, { level: 6 })], { type: 'application/zip' })
}

export async function readFullBackup(file: Blob): Promise<FullBackup> {
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()))
  const manifest = parseJson<unknown>(files, 'manifest.json')
  validateManifest(manifest)

  const settings = parseJson<unknown>(files, 'settings.json')
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)
    || !Object.entries(settings).every(([key, value]) => key.startsWith('vn_') && typeof value === 'string')) {
    throw new Error('备份设置无效')
  }

  const recordings = parseJson<unknown>(files, 'recordings.json')
  if (!Array.isArray(recordings) || recordings.length !== manifest.recordingCount
    || !recordings.every(isRecording)) {
    throw new Error('录音清单无效')
  }
  const recordingIds = new Set(recordings.map((recording) => (recording as Recording).id))
  if (recordingIds.size !== recordings.length) throw new Error('录音清单无效')
  const chunkIds = new Set<string>()
  const paths = new Set<string>()
  const chunks = manifest.audioEntries.map((entry) => {
    if (chunkIds.has(entry.id) || paths.has(entry.path) || !recordingIds.has(entry.recordingId)) {
      throw new Error('备份音频清单无效')
    }
    chunkIds.add(entry.id)
    paths.add(entry.path)
    const bytes = files[entry.path]
    if (!bytes || bytes.byteLength !== entry.size) throw new Error(`备份缺少或损坏音频：${entry.path}`)
    return {
      id: entry.id,
      recordingId: entry.recordingId,
      index: entry.index,
      createdAt: entry.createdAt,
      blob: new Blob([bytes], { type: entry.type }),
      size: entry.size,
    }
  })

  return { manifest, settings: settings as Record<string, string>, recordings: recordings as Recording[], chunks }
}

export async function replaceLocalData(backup: FullBackup): Promise<void> {
  // 对可能缺失 typeId/typeName/localTitle 的旧版本记录进行平滑升级填充，防止 UI 渲染故障
  const normalizedRecordings = backup.recordings.map((rec) => {
    return {
      ...rec,
      typeId: rec.typeId ?? 'default',
      typeName: rec.typeName ?? '未分类',
      localTitle: rec.localTitle ?? '',
      recovered: rec.recovered ?? false,
      interrupted: rec.interrupted ?? false
    } as Recording
  })

  await recordingDb.transaction('rw', recordingDb.recordings, recordingDb.audioChunks, async () => {
    await recordingDb.audioChunks.clear()
    await recordingDb.recordings.clear()
    await recordingDb.recordings.bulkPut(normalizedRecordings)
    await recordingDb.audioChunks.bulkPut(backup.chunks)
  })

  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index)
    if (key?.startsWith('vn_')) localStorage.removeItem(key)
  }
  for (const [key, value] of Object.entries(backup.settings)) {
    localStorage.setItem(key, value)
  }
}
