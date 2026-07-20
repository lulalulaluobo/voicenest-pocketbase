import { Notice, Plugin, PluginSettingTab, Setting, TFile, requestUrl, type App } from 'obsidian'

interface Settings { baseUrl: string, apiToken: string, directory: string, interval: number }
interface Note { id: string, title: string, markdown: string, path: string }
interface PluginData { cursor?: string }
const defaults: Settings = { baseUrl: '', apiToken: '', directory: 'VoiceNest', interval: 30 }

export default class VoiceNestSync extends Plugin {
  settings: Settings = { ...defaults }
  private timer: number | null = null
  private syncing = false

  async onload() {
    this.settings = Object.assign({}, defaults, await this.loadData())
    this.addRibbonIcon('download', '同步 VoiceNest', () => void this.sync(true))
    this.addCommand({ id: 'sync-now', name: '立即同步 VoiceNest', callback: () => void this.sync(true) })
    this.addSettingTab(new VoiceNestSettings(this.app, this))
    this.restartPolling()
  }
  onunload() { if (this.timer !== null) window.clearInterval(this.timer) }
  async saveSettings() { await this.saveData({ ...(await this.loadData()), ...this.settings }); this.restartPolling() }
  restartPolling() {
    if (this.timer !== null) window.clearInterval(this.timer)
    this.timer = this.settings.baseUrl && this.settings.apiToken ? window.setInterval(() => void this.sync(false), Math.max(5, this.settings.interval) * 1000) : null
    if (this.timer !== null) this.registerInterval(this.timer)
  }
  private async request(path: string, method = 'GET', body?: unknown) {
    return requestUrl({ url: `${this.settings.baseUrl.replace(/\/+$/, '')}${path}`, method, body: body ? JSON.stringify(body) : undefined, headers: { Authorization: `Bearer ${this.settings.apiToken}`, ...(body ? { 'Content-Type': 'application/json' } : {}) } })
  }
  async sync(manual: boolean) {
    if (this.syncing) return
    if (!this.settings.baseUrl || !this.settings.apiToken) { if (manual) new Notice('请先填写后端地址和同步 Token'); return }
    this.syncing = true
    try {
      const data = (await this.loadData()) as PluginData
      const result = await this.request(`/api/obsidian/sync/changes?cursor=${encodeURIComponent(data.cursor || '')}&limit=50`)
      const response = result.json as { notes: Note[], last_id: string }
      const ackIds: string[] = []
      for (const note of response.notes || []) {
        const directory = (note.path || this.settings.directory).replace(/^\/+|\/+$/g, '')
        const title = note.title.replace(/[\\/:*?"<>|]/g, ' ').trim() || '未命名笔记'
        const basePath = directory ? `${directory}/${title}` : title
        if (directory && !this.app.vault.getAbstractFileByPath(directory)) await this.app.vault.createFolder(directory)
        const existing = this.app.vault.getMarkdownFiles().find((candidate) => this.app.metadataCache.getFileCache(candidate)?.frontmatter?.voicenest_id === note.id)
        let path = `${basePath}.md`
        let target = this.app.vault.getAbstractFileByPath(path)
        for (let suffix = 2; target && target !== existing; suffix++) { path = `${basePath} (${suffix}).md`; target = this.app.vault.getAbstractFileByPath(path) }
        if (existing && existing.path !== path) await this.app.fileManager.renameFile(existing, path)
        const content = `---\nvoicenest_id: ${note.id}\n---\n\n# ${note.title}\n\n${note.markdown}`
        const file = existing || this.app.vault.getAbstractFileByPath(path)
        if (file instanceof TFile) await this.app.vault.modify(file, content); else await this.app.vault.create(path, content)
        ackIds.push(note.id)
      }
      if (ackIds.length) await this.request('/api/obsidian/sync/ack', 'POST', { noteIds: ackIds })
      if (response.last_id && ackIds.length === (response.notes || []).length) await this.saveData({ ...data, cursor: response.last_id })
      if (manual) new Notice(ackIds.length ? `已同步 ${ackIds.length} 篇笔记` : '没有待同步笔记')
    } catch (error) {
      console.error('[voicenest-sync] 同步失败', error)
      if (manual) new Notice('同步失败，请检查同步 Token 与后端地址')
    } finally { this.syncing = false }
  }
}

class VoiceNestSettings extends PluginSettingTab {
  constructor(app: App, private plugin: VoiceNestSync) { super(app, plugin) }
  display() {
    const { containerEl } = this; containerEl.empty()
    new Setting(containerEl).setName('后端地址').setDesc('PocketBase HTTPS 地址').addText((text) => text.setValue(this.plugin.settings.baseUrl).onChange(async (value) => { this.plugin.settings.baseUrl = value.trim(); await this.plugin.saveSettings() }))
    new Setting(containerEl).setName('同步 Token').setDesc('在 VoiceNest 设置页生成，可随时撤销。').addText((text) => { text.setValue(this.plugin.settings.apiToken).onChange(async (value) => { this.plugin.settings.apiToken = value.trim(); await this.plugin.saveSettings() }); text.inputEl.type = 'password' })
    new Setting(containerEl).setName('默认目录').addText((text) => text.setValue(this.plugin.settings.directory).onChange(async (value) => { this.plugin.settings.directory = value.trim() || defaults.directory; await this.plugin.saveSettings() }))
    new Setting(containerEl).setName('轮询秒数').addText((text) => text.setValue(String(this.plugin.settings.interval)).onChange(async (value) => { this.plugin.settings.interval = Math.max(5, Number(value) || defaults.interval); await this.plugin.saveSettings() }))
  }
}
