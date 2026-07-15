export type RecordingStatus =
  | 'recording'
  | 'ready'
  | 'recovered'
  | 'interrupted'
  | 'waiting_network'
  | 'processing'
  | 'synced'
  | 'failed'

export type WechatDraftStatus =
  | 'idle'
  | 'syncing'
  | 'drafted'
  | 'failed'
  | 'authorization_required'

export type ImageMimeType = 'image/png' | 'image/jpeg' | 'image/webp'

export interface Recording {
  id: string
  createdAt: string
  updatedAt: string
  typeId: string
  typeName: string
  durationMs: number
  mimeType: string
  chunkIds: string[]
  status: RecordingStatus
  recovered: boolean
  interrupted: boolean
  localTitle: string
  transcript?: string
  summary?: string
  errorMessage?: string
  isAudioCleared?: boolean
  wechatStatus?: WechatDraftStatus
  wechatDraftMediaId?: string
  wechatErrorMessage?: string
  wechatRequestId?: string
  wechatTitle?: string
  wechatMarkdown?: string
  wechatCoverBlob?: Blob
  wechatCoverMimeType?: ImageMimeType
}

export interface AudioChunk {
  id: string
  recordingId: string
  index: number
  createdAt: string
  blob: Blob
  size: number
}

export interface NoteType {
  id: string
  name: string
}

export const SAMPLE_NOTE_TYPES: NoteType[] = [
  { id: 'idea', name: '随想' },
  { id: 'journal', name: '日记' },
  { id: 'meeting', name: '会议' },
  { id: 'project', name: '项目' },
]
