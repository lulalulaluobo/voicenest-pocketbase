export type RecordingStatus =
  | 'recording'
  | 'ready'
  | 'recovered'
  | 'interrupted'
  | 'waiting_network'
  | 'processing'
  | 'synced'
  | 'failed'

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
