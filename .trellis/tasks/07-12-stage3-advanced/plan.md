# Voice Inbox 阶段 3：重名保护、配置备份恢复与存储保留策略 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 开发并交付 Obsidian 重名保护机制、LocalStorage 配置智能合并备份与导入功能，以及基于时间期限的本地 IndexedDB 音频/文本自动过期保留清理策略。

**Architecture:**
1. **重名保护**：重构 `sync.ts`，首轮以 `createOnly: true` 写入，若收到 `431` 错误（Note already exists），自动拼接当前时间戳（例如 `_1525`）并启用覆盖写入或二次重试；
2. **备份恢复**：在设置页提供“导出配置备份”（过滤剥离敏感的 API Keys），导入配置时若备份为空而本地有密钥，则自动保留本地已有 API Key 的“智能融合导入”；
3. **存储清理**：引入清理扫描例程，支持“同步后立即清除音频”、“7天/30天到期清除分片与文本”策略，降低本地 IndexedDB 存储压力。

**Tech Stack:** React (v18), TypeScript, localforage / LocalStorage, Dexie (IndexedDB), File API, FileReader.

## Global Constraints

- 备份文件绝对不能携带 ASR/LLM API Key 及 FNS Token 等敏感凭证；
- 导入配置时，禁止以空的 API Key 覆盖用户本地正在使用且有效的密钥；
- 重名保护重试必须有上限限制（最大 3 次连环防撞重试）；
- 本地 IndexedDB 音频清理仅清空 `audioChunks`（音频二进制数据），除非用户设置了文本过期，否则应保留录音对应的文本和卡片历史以备后续阅读。

---

## 任务 1：实现 Obsidian 写入重名保护机制

**Files:**
- Modify: `src/lib/sync.ts`
- Modify: `src/lib/api-clients.test.ts`

**Interfaces:**
- Consumes: Fast Note Sync Note API
- Produces: 支持防撞重试且自适应时间戳后缀的 `syncToObsidian`

- [ ] **Step 1: 更新单元测试以验证重名保护逻辑 (TDD 失败测试)**
  在 `src/lib/api-clients.test.ts` 中，增加一个“当发生重名碰撞时，应自动拼接时间戳后缀重试”的测试用例。
  ```typescript
  it('should auto append suffix and retry when note already exists', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: false, code: 431, message: 'Note already exists' }),
      status: 200
    } as Response)

    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: true, code: 1 }),
      status: 200
    } as Response)

    await expect(
      syncToObsidian('重名文件', '# 内容', 'Inbox/Ideas', {
        api: 'http://localhost:8080',
        apiToken: 'token-xyz',
        vault: 'my-vault'
      })
    ).resolves.not.toThrow()

    expect(globalThis.fetch).toHaveBeenCalledTimes(2)
  })
  ```

- [ ] **Step 2: 运行测试验证失败**
  Run: `npm run test`
  Expected: 新测试用例失败。

- [ ] **Step 3: 重构 syncToObsidian 同步方法**
  修改 `src/lib/sync.ts`，首轮以 `createOnly: true` 写入，若捕获到 `code === 431` 或者是 `message.includes('already exists')`，自动在文件名后面追加 `_时分秒` 时间后缀（如 `重名文件_152520`），并开启 `createOnly: false` 进行第二次提交。

- [ ] **Step 4: 运行测试验证通过**
  Run: `npm run test`
  Expected: 单元测试绿灯通过。

---

## 任务 2：实现配置与分类的备份与恢复

**Files:**
- Modify: `src/pages/SettingsPage.tsx`

**Interfaces:**
- Consumes: LocalStorage, File, FileReader
- Produces: 备份导出下载及智能合并导入

- [ ] **Step 1: 在 SettingsPage 中实现“导出备份”逻辑**
  在 `SettingsPage.tsx` 中编写 `handleExportBackup` 函数：
  - 读取本地存储配置；
  - 剥离敏感凭证：将 `vn_asr`、`vn_llm` 的 `apiKey` 置为 `""`，将 `vn_sync` 的 `apiToken` 置为 `""`；
  - 转化为 JSON 字符串并使用 `URL.createObjectURL(new Blob([...]))` 触发浏览器下载 `voicenest_backup_日期.json`。

- [ ] **Step 2: 在 SettingsPage 中实现“导入备份”与“智能融合”逻辑**
  在 `SettingsPage.tsx` 中编写 `handleImportBackup` 函数：
  - 提供隐藏的 `<input type="file" accept=".json" />` 并在点击“导入配置”时模拟触发 click；
  - 使用 `FileReader` 读取并解析为 JSON 对象；
  - **智能融合算法**：
    - 若导入的配置中 `apiKey`（或 `apiToken`）为空，而本地已有的 localStorage 中对应的 API Key 非空，**自动保留本地已有的非空密钥**，防止覆盖后被迫重填；
  - 合并后保存回本地 LocalStorage，并使用 `alert` 提示并重新刷新 State。

- [ ] **Step 3: 运行打包与静态测试**
  Run: `npm run test && npm run build`
  Expected: 无 TS 错误及打包警告。

---

## 任务 3：本地存储容量到期自动保留清理策略

**Files:**
- Modify: `src/lib/config-store.ts`
- Modify: `src/pages/SettingsPage.tsx`
- Modify: `src/hooks/use-processor.ts`
- Modify: `src/App.tsx`
- Create: `src/lib/retention.ts`

- [ ] **Step 1: 扩展 AppSettings 并初始化本地选项**
  修改 `src/lib/config-store.ts` 和 `SettingsPage.tsx`：
  - 支持 `vn_audio_retention` (可选：`immediate` | `7d` | `30d` | `forever`，默认 `forever`)；
  - 支持 `vn_text_retention` (可选：`7d` | `30d` | `forever`，默认 `forever`)；
  - 在设置页提供对应的下拉菜单（select 框）进行保存。

- [ ] **Step 2: 编写数据库保留清理引擎**
  新建 `src/lib/retention.ts`，导出以下清理例程：
  - `cleanSyncedAudioChunks(id: string)`: 立即清空指定录音在 IndexedDB 里的 `audioChunks` 以释放大容量媒体占用；
  - `sweepExpiredStorage()`: 获取当前设置的时间策略，检索所有 `status === 'synced'` 且已超过过期时间的 recordings，自动清除对应的音频分片；若文本也已到期，则连卡片和转写一并删除。

- [ ] **Step 3: 集成清理机制到处理流与应用挂载**
  - 修改 `src/hooks/use-processor.ts`：在每次处理同步成功（状态变为 `synced`）后，检查如果 `vn_audio_retention === 'immediate'`，立即调用 `cleanSyncedAudioChunks(id)` 清除分片数据；
  - 修改 `src/App.tsx`：在数据库就绪（`restored === true`）时，除了触发自动网络重试，也在后台自动执行一次 `sweepExpiredStorage()`，确保静默期间的自动清理。

- [ ] **Step 4: 运行全部单元测试及静态编译**
  Run: `npm run test && npm run build`
  Expected: 顺利通过无红灯。

- [ ] **Step 5: Git 提交并推送 Vercel 线上**
  Run: `git add . && git commit -m "feat: 实现重名防撞、配置脱敏备份恢复及 IndexedDB 音频到期清理策略"`
  Run: `npx vercel --prod`
  Expected: 线上部署就绪，全链路打通。

---

## Verification Plan

### Automated Tests
- 运行 Vitest 测试套件：
  ```bash
  npm run test
  ```
  预期通过包含“防碰撞连环重试”和“API mock 客户端”在内的全部用例。

### Manual Verification
1. **重名保护校验**：
   - 连续两次录制内容不同但标题相同的随想，同步完成后，查看本地 Obsidian 目录，预期不会被覆盖，而是生成了两个文件（例如 `随想_1.md` 和 `随想_1_152520.md`）。
2. **脱敏备份与融合导入校验**：
   - 填写好 API Key 并新建一个分类类型，点击“导出备份”。用文本编辑器打开 JSON 文件，**检验 keys 是否全部脱敏置空**。
   - 删除新建的分类类型，点击“导入配置”导入该 JSON，预期新建分类成功恢复，而**原本已填写的 API Key 依然保留，没有被清空**。
3. **空间保留清理校验**：
   - 设置“同步成功后立即清除音频分片”。录制并执行同步，同步完成后进入详情页，音频播放器应该显示“没有可播放的音频分片”（已被清理），而在列表页中依然能正常查看转写文本和整理好的 Markdown。
