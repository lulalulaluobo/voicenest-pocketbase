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
  AGNES_API_KEY?: string
}

export type ImageMimeType = 'image/png' | 'image/jpeg' | 'image/webp'

export interface WechatCoverImage {
  dataUrl: string
  mimeType: ImageMimeType
}

export interface CoverGenerateRequest {
  title: string
  markdown: string
  prompt: string
  referenceImageDataUrl?: string
}

export interface DraftRequest {
  recordingId: string
  requestId: string
  title: string
  markdown: string
  draftMediaId?: string
  coverImage?: WechatCoverImage
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
