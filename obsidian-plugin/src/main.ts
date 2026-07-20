import { Notice, Plugin, PluginSettingTab, Setting, TFile, requestUrl, type App } from 'obsidian'

interface Settings { baseUrl: string, email: string, password: string, directory: string, interval: number }
interface Note { id: string, title: string, markdown: string, path: string }
const defaults: Settings = { baseUrl: '', email: '', password: '', directory: 'VoiceNest', interval: 30 }

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

  async saveSettings() { await this.saveData(this.settings); this.restartPolling() }

  restartPolling() {
    if (this.timer !== null) window.clearInterval(this.timer)
    this.timer = null
    if (this.settings.baseUrl && this.settings.email && this.settings.password) {
      this.timer = window.setInterval(() => void this.sync(false), Math.max(5, this.settings.interval) * 1000)
      this.registerInterval(this.timer)
    }
  }

  async sync(manual: boolean) {
    if (this.syncing) return
    if (!this.settings.baseUrl || !this.settings.email || !this.settings.password) {
      if (manual) new Notice('请先填写 VoiceNest 后端地址、邮箱和密码')
      return
    }
    this.syncing = true
    try {
      const baseUrl = this.settings.baseUrl.replace(/\/+$/, '')
      const auth = await requestUrl({ url: `${baseUrl}/api/collections/users/auth-with-password`, method: 'POST', body: JSON.stringify({ identity: this.settings.email, password: this.settings.password }), headers: { 'Content-Type': 'application/json' } })
      const token = (auth.json as { token: string }).token
      const result = await requestUrl({ url: `${baseUrl}/api/collections/obsidian_notes/records?filter=${encodeURIComponent("syncedAt = ''")}&sort=created&perPage=50`, headers: { Authorization: `Bearer ${token}` } })
      const notes = ((result.json as { items: Note[] }).items || [])
      for (const note of notes) {
        const directory = (note.path || this.settings.directory).replace(/^\/+|\/+$/g, '')
        const filename = `${note.id}-${note.title.replace(/[\\/:*?"<>|]/g, ' ').trim() || '未命名笔记'}.md`
        const path = directory ? `${directory}/${filename}` : filename
        if (directory && !this.app.vault.getAbstractFileByPath(directory)) await this.app.vault.createFolder(directory)
        const content = `---\nvoicenest_id: ${note.id}\n---\n\n# ${note.title}\n\n${note.markdown}`
        const file = this.app.vault.getAbstractFileByPath(path)
        if (file instanceof TFile) await this.app.vault.modify(file, content)
        else await this.app.vault.create(path, content)
        await requestUrl({ url: `${baseUrl}/api/collections/obsidian_notes/records/${note.id}`, method: 'PATCH', body: JSON.stringify({ syncedAt: new Date().toISOString() }), headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } })
      }
      if (manual) new Notice(notes.length ? `已同步 ${notes.length} 篇笔记` : '没有待同步笔记')
    } catch (error) {
      console.error('[voicenest-sync] 同步失败', error)
      if (manual) new Notice('同步失败，请检查后端地址与登录凭据')
    } finally { this.syncing = false }
  }
}

class VoiceNestSettings extends PluginSettingTab {
  constructor(app: App, private plugin: VoiceNestSync) { super(app, plugin) }
  display() {
    const { containerEl } = this
    containerEl.empty()
    new Setting(containerEl).setName('后端地址').setDesc('PocketBase HTTPS 地址').addText((text) => text.setValue(this.plugin.settings.baseUrl).onChange(async (value) => { this.plugin.settings.baseUrl = value.trim(); await this.plugin.saveSettings() }))
    new Setting(containerEl).setName('邮箱').addText((text) => text.setValue(this.plugin.settings.email).onChange(async (value) => { this.plugin.settings.email = value.trim(); await this.plugin.saveSettings() }))
    new Setting(containerEl).setName('密码').addText((text) => { text.setValue(this.plugin.settings.password).onChange(async (value) => { this.plugin.settings.password = value; await this.plugin.saveSettings() }); text.inputEl.type = 'password' })
    new Setting(containerEl).setName('默认目录').setDesc('笔记类型未设置目录时使用').addText((text) => text.setValue(this.plugin.settings.directory).onChange(async (value) => { this.plugin.settings.directory = value.trim() || defaults.directory; await this.plugin.saveSettings() }))
    new Setting(containerEl).setName('轮询秒数').addText((text) => text.setValue(String(this.plugin.settings.interval)).onChange(async (value) => { this.plugin.settings.interval = Math.max(5, Number(value) || defaults.interval); await this.plugin.saveSettings() }))
  }
}
