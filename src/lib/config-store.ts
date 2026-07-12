import type { ASRConfig } from './asr'
import type { LLMConfig } from './llm'
import type { SyncConfig } from './sync'

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
    prompt: '梳理成专业的会议纪要，包含参与人员、核心议题、会议决策以及 Todo 待办事项。',
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

function readStoredJson<T>(key: string, fallback: T): T {
  const data = localStorage.getItem(key)
  if (!data) return fallback

  try {
    return JSON.parse(data) as T
  } catch {
    localStorage.removeItem(key)
    return fallback
  }
}

export function getASRConfig(): ASRConfig {
  return readStoredJson('vn_asr', { type: 'openai', endpoint: 'https://api.openai.com/v1', apiKey: '', model: 'whisper-1' })
}

export function saveASRConfig(cfg: ASRConfig): void {
  localStorage.setItem('vn_asr', JSON.stringify(cfg))
}

export function getLLMConfig(): LLMConfig {
  return readStoredJson('vn_llm', { endpoint: 'https://api.openai.com/v1', apiKey: '', model: 'gpt-4o' })
}

export function saveLLMConfig(cfg: LLMConfig): void {
  localStorage.setItem('vn_llm', JSON.stringify(cfg))
}

export function getSyncConfig(): SyncConfig {
  return readStoredJson('vn_sync', { api: '', apiToken: '', vault: '' })
}

export function saveSyncConfig(cfg: SyncConfig): void {
  localStorage.setItem('vn_sync', JSON.stringify(cfg))
}

export function getNoteTypes(): UserNoteType[] {
  const types = readStoredJson<UserNoteType[] | null>('vn_note_types', null)
  if (!types) {
    localStorage.setItem('vn_note_types', JSON.stringify(DEFAULT_NOTE_TYPES))
    return DEFAULT_NOTE_TYPES
  }
  return types
}

export function saveNoteTypes(types: UserNoteType[]): void {
  localStorage.setItem('vn_note_types', JSON.stringify(types))
}

export type AudioRetentionType = 'immediate' | '7d' | '30d' | 'forever'
export type TextRetentionType = '7d' | '30d' | 'forever'

export function getAudioRetention(): AudioRetentionType {
  return (localStorage.getItem('vn_audio_retention') as AudioRetentionType) || 'forever'
}

export function saveAudioRetention(val: AudioRetentionType): void {
  localStorage.setItem('vn_audio_retention', val)
}

export function getTextRetention(): TextRetentionType {
  return (localStorage.getItem('vn_text_retention') as TextRetentionType) || 'forever'
}

export function saveTextRetention(val: TextRetentionType): void {
  localStorage.setItem('vn_text_retention', val)
}
