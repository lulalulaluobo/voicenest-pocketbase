import type { ASRConfig } from './asr'
import type { LLMConfig } from './llm'
import type { SyncConfig } from './sync'
import { pb } from './pocketbase'

export interface WechatDraftConfig {
  enabled: boolean
  workerUrl: string
}

export interface WechatPromptTemplate {
  id: string
  name: string
  prompt: string
}

const DEFAULT_WECHAT_PROMPT_TEMPLATES: WechatPromptTemplate[] = [
  {
    id: 'insight',
    name: '观点随笔',
    prompt: '将这篇个人笔记改写为第一人称的公众号观点随笔。保留真实感受和核心观点，自然分段，并用简洁的结尾收束全文。'
  },
  {
    id: 'knowledge',
    name: '知识分享',
    prompt: '将这篇个人笔记改写为清晰克制的公众号知识分享。围绕问题、观点、解释和可行动建议组织内容，不要杜撰事实。'
  },
  {
    id: 'daily',
    name: '日常记录',
    prompt: '将这篇个人笔记改写为自然温暖的公众号日常记录。保留具体场景和情绪，语言真诚，不要拔高或杜撰。'
  }
]

export interface UserNoteType {
  id: string
  name: string
  prompt: string
  template: string
  obsidianPath: string
  isDefault?: boolean
  overrideLLM?: boolean
  llmConfig?: LLMConfig
}

const DEFAULT_NOTE_TYPES: UserNoteType[] = [
  {
    id: 'idea',
    name: '随想',
    prompt: '梳理成精炼、分段清晰的灵感笔记，提炼出 3 个关键词。',
    template: '# {{title}}\n\n## 💡 核心观点\n- \n\n## 📝 详细内容\n{{content}}\n\n---\n标签: #随想 #{{tags}}',
    obsidianPath: 'Inbox/Ideas',
    isDefault: true
  },
  {
    id: 'journal',
    name: '日记',
    prompt: '整理为温暖感性的日记，包含当天活动、所思所想和情绪提炼。',
    template: '# {{title}}\n\n## 📅 日记详情\n{{content}}\n\n## 🧠 今日反思与感悟\n- \n\n---\n标签: #日记',
    obsidianPath: 'Inbox/Journals'
  },
  {
    id: 'meeting',
    name: '会议',
    prompt: '整理为专业的会议纪要，包含参与人员、核心议题、会议决策以及 Todo 待办事项。',
    template: '# {{title}}\n\n## 👥 参会背景\n\n## 🎯 决策与共识\n- \n\n## ⏳ 行动项 (Todo)\n- [ ] \n\n## 📋 会议记录\n{{content}}',
    obsidianPath: 'Inbox/Meetings'
  },
  {
    id: 'project',
    name: '项目',
    prompt: '整理为结构化的项目备忘录，理清技术方案、当前进度和阻塞点。',
    template: '# {{title}}\n\n## 🚀 项目规划\n\n## 🛠️ 技术细节\n{{content}}\n\n## 🚧 遗留问题与待办\n- [ ] ',
    obsidianPath: 'Inbox/Projects'
  }
]

// 异步同步云端配置到本地 localStorage
export async function syncSettingsFromCloud(): Promise<void> {
  if (!pb.authStore.isValid || !pb.authStore.model) return
  try {
    const user = await pb.collection('users').getOne(pb.authStore.model.id)
    if (user.asrConfig) localStorage.setItem('vn_asr', JSON.stringify(user.asrConfig))
    if (user.llmConfig) localStorage.setItem('vn_llm', JSON.stringify(user.llmConfig))
    if (user.syncConfig) localStorage.setItem('vn_sync', JSON.stringify(user.syncConfig))
    if (user.noteTypes) localStorage.setItem('vn_note_types', JSON.stringify(user.noteTypes))
    if (user.wechatDraftConfig) localStorage.setItem('vn_wechat_draft', JSON.stringify(user.wechatDraftConfig))
    if (user.wechatPromptTemplates) localStorage.setItem('vn_wechat_prompt_templates', JSON.stringify(user.wechatPromptTemplates))
    if (user.audioRetention) localStorage.setItem('vn_audio_retention', user.audioRetention)
    if (user.textRetention) localStorage.setItem('vn_text_retention', user.textRetention)
  } catch (err) {
    console.error('从云端同步配置失败，将沿用本地配置:', err)
  }
}

// 异步写回云端
async function saveToCloud(key: string, value: any): Promise<void> {
  if (!pb.authStore.isValid || !pb.authStore.model) return
  try {
    await pb.collection('users').update(pb.authStore.model.id, {
      [key]: value
    })
  } catch (err) {
    console.error(`保存 ${key} 至云端失败:`, err)
  }
}

export function getASRConfig(): ASRConfig {
  const data = localStorage.getItem('vn_asr')
  return data ? JSON.parse(data) : { type: 'openai', endpoint: 'https://api.openai.com/v1', apiKey: '', model: 'whisper-1' }
}

export function saveASRConfig(cfg: ASRConfig): void {
  localStorage.setItem('vn_asr', JSON.stringify(cfg))
  void saveToCloud('asrConfig', cfg)
}

export function getLLMConfig(): LLMConfig {
  const data = localStorage.getItem('vn_llm')
  return data ? JSON.parse(data) : { endpoint: 'https://api.openai.com/v1', apiKey: '', model: 'gpt-4o' }
}

export function saveLLMConfig(cfg: LLMConfig): void {
  localStorage.setItem('vn_llm', JSON.stringify(cfg))
  void saveToCloud('llmConfig', cfg)
}

export function getSyncConfig(): SyncConfig {
  const data = localStorage.getItem('vn_sync')
  return data ? JSON.parse(data) : { api: 'http://localhost:8080', apiToken: '', vault: '' }
}

export function saveSyncConfig(cfg: SyncConfig): void {
  localStorage.setItem('vn_sync', JSON.stringify(cfg))
  void saveToCloud('syncConfig', cfg)
}

export function getWechatDraftConfig(): WechatDraftConfig {
  const data = localStorage.getItem('vn_wechat_draft')
  return data ? JSON.parse(data) : { enabled: false, workerUrl: '' }
}

export function saveWechatDraftConfig(config: WechatDraftConfig): void {
  localStorage.setItem('vn_wechat_draft', JSON.stringify(config))
  void saveToCloud('wechatDraftConfig', config)
}

export function getWechatPromptTemplates(): WechatPromptTemplate[] {
  const data = localStorage.getItem('vn_wechat_prompt_templates')
  if (!data) {
    localStorage.setItem('vn_wechat_prompt_templates', JSON.stringify(DEFAULT_WECHAT_PROMPT_TEMPLATES))
    return DEFAULT_WECHAT_PROMPT_TEMPLATES
  }
  return JSON.parse(data)
}

export function saveWechatPromptTemplates(templates: WechatPromptTemplate[]): void {
  localStorage.setItem('vn_wechat_prompt_templates', JSON.stringify(templates))
  void saveToCloud('wechatPromptTemplates', templates)
}

export function getNoteTypes(): UserNoteType[] {
  const data = localStorage.getItem('vn_note_types')
  if (!data) {
    localStorage.setItem('vn_note_types', JSON.stringify(DEFAULT_NOTE_TYPES))
    return DEFAULT_NOTE_TYPES
  }
  return JSON.parse(data)
}

export function saveNoteTypes(types: UserNoteType[]): void {
  localStorage.setItem('vn_note_types', JSON.stringify(types))
  void saveToCloud('noteTypes', types)
}

export type AudioRetentionType = 'immediate' | '7d' | '30d' | 'forever'
export type TextRetentionType = '7d' | '30d' | 'forever'

export function getAudioRetention(): AudioRetentionType {
  return (localStorage.getItem('vn_audio_retention') as AudioRetentionType) || 'forever'
}

export function saveAudioRetention(val: AudioRetentionType): void {
  localStorage.setItem('vn_audio_retention', val)
  void saveToCloud('audioRetention', val)
}

export function getTextRetention(): TextRetentionType {
  return (localStorage.getItem('vn_text_retention') as TextRetentionType) || 'forever'
}

export function saveTextRetention(val: TextRetentionType): void {
  localStorage.setItem('vn_text_retention', val)
  void saveToCloud('textRetention', val)
}
