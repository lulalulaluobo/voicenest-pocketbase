export interface KVStore {
  get(key: string): Promise<string | null>
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>
}

export interface Env {
  WECHAT_CACHE: KVStore
  WECHAT_APP_ID: string
  WECHAT_APP_SECRET: string
  WECHAT_COVER_MEDIA_ID: string
  ALLOWED_ORIGIN: string
}

export interface DraftRequest {
  recordingId: string
  requestId: string
  title: string
  markdown: string
  draftMediaId?: string
}

export interface DraftResponse {
  mediaId: string
  reused: boolean
}

export interface DraftArticle {
  title: string
  content: string
  thumb_media_id: string
  need_open_comment: 0
  only_fans_can_comment: 0
}
