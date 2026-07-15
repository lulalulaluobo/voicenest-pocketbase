import type { WechatDraftConfig } from './config-store'
import { isObsidianConfigured, syncToObsidian, type SyncConfig } from './sync'
import {
  publishWechatDraft,
  WechatDraftError,
  type WechatDraftRequest,
  type WechatDraftResult,
} from './wechat'

export interface SyncProcessedNoteInput {
  recordingId: string
  title: string
  markdown: string
  obsidianDir: string
  obsidianConfig: SyncConfig
  wechatConfig: WechatDraftConfig
  wechatRequestId?: string
  wechatDraftMediaId?: string
}

export interface SyncTargetResult {
  ok: boolean
  error?: string
  mediaId?: string
  authorizationRequired?: boolean
}

export interface SyncProcessedNoteResult {
  obsidian?: SyncTargetResult
  wechat?: SyncTargetResult
}

export interface SyncTargetDependencies {
  syncToObsidian: typeof syncToObsidian
  publishWechatDraft: (config: WechatDraftConfig, request: WechatDraftRequest) => Promise<WechatDraftResult>
}

const defaultDependencies: SyncTargetDependencies = {
  syncToObsidian,
  publishWechatDraft,
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '未知错误'
}

export async function syncProcessedNote(
  input: SyncProcessedNoteInput,
  dependencies: SyncTargetDependencies = defaultDependencies
): Promise<SyncProcessedNoteResult> {
  const result: SyncProcessedNoteResult = {}

  if (isObsidianConfigured(input.obsidianConfig)) {
    try {
      await dependencies.syncToObsidian(
        input.title,
        input.markdown,
        input.obsidianDir,
        input.obsidianConfig
      )
      result.obsidian = { ok: true }
    } catch (error) {
      result.obsidian = { ok: false, error: errorMessage(error) }
    }
  }

  if (input.wechatConfig.enabled) {
    if (!input.wechatRequestId) {
      result.wechat = { ok: false, error: '未创建公众号草稿请求标识' }
    } else {
      try {
        const draft = await dependencies.publishWechatDraft(input.wechatConfig, {
          recordingId: input.recordingId,
          requestId: input.wechatRequestId,
          title: input.title,
          markdown: input.markdown,
          draftMediaId: input.wechatDraftMediaId,
        })
        result.wechat = { ok: true, mediaId: draft.mediaId }
      } catch (error) {
        result.wechat = {
          ok: false,
          error: errorMessage(error),
          authorizationRequired: error instanceof WechatDraftError && error.kind === 'authorization',
        }
      }
    }
  }

  return result
}
