# 主页录音控制区布局调整实施计划

> **执行方式：** 主会话内联执行；先测试后实现。

**目标：** 主页删除最近录音，录音控制移至卡片下方左右排列，并固定为单屏。

**方案：** 保留 `useRecorder`、结束保存和自动整理流程，只从 `HomePage` 删除最近录音的数据加载与渲染。复用现有 `.pause-row`、`.ghost` 控制样式，增加仅作用于主页的 `.home-view` 固定高度布局。

**技术栈：** React 19、TypeScript、CSS、Vitest。

## 全局约束

- 不增加依赖、不改录音数据结构或录音 hook。
- 主页的空闲、录音中、暂停三种状态均不得出现纵向滚动。
- 已保存录音仍通过既有“列表”页查看。

---

### 任务 1：重排主页录音控制区

**文件：**

- 新建：`src/pages/home-layout.test.ts`
- 修改：`src/pages/HomePage.tsx`
- 修改：`src/styles.css`

**接口：**

- 消费：`useRecorder()` 返回的 `state`、`pause()`、`resume()`、`stop()`；签名不变。
- 保持：结束按钮继续调用 `complete()`，不修改保存与自动整理路径。

- [ ] **步骤 1：写会失败的布局契约测试**

```ts
it('uses the compact fixed-height homepage layout without recent recordings', () => {
  expect(homePage).not.toContain('RecordingCard')
  expect(homePage).not.toContain('listRecordings')
  expect(homePage).toContain('className="view home-view"')
  expect(styles).toMatch(/\.home-view\s*\{[^}]*height:\s*100dvh;[^}]*overflow:\s*hidden;/s)
})
```

- [ ] **步骤 2：运行测试并确认失败**

运行：`npm test -- src/pages/home-layout.test.ts`

预期：失败，因为主页尚未使用 `.home-view`，且仍包含最近录音依赖。

- [ ] **步骤 3：写最小实现**

从 `HomePage.tsx` 移除 `RecordingCard`、`Recording`、`listRecordings`、最近录音状态和列表 JSX；将现有 `.pause-row` 放到录音卡片后，保留暂停/继续和完成事件。为主页根节点添加 `home-view`。

在 `styles.css` 中为 `.home-view` 设定 `height: 100dvh`、纵向 flex 布局与 `overflow: hidden`；让录音卡填充剩余空间，暂停行固定在卡片下方，保留底部导航的安全间距。

- [ ] **步骤 4：运行定向测试并确认通过**

运行：`npm test -- src/pages/home-layout.test.ts`

预期：通过。

- [ ] **步骤 5：运行完整验证**

运行：`npm test && npm run build`

预期：测试和 TypeScript/Vite 构建均通过。

- [ ] **步骤 6：提交变更**

运行：`git add src/pages/HomePage.tsx src/styles.css src/pages/home-layout.test.ts .trellis/tasks/07-16-home-record-controls && git commit -m "feat: 调整主页录音控制布局"`

预期：提交成功；随后运行 `codegraph sync`（若命令可用）。

## 自检

- 需求覆盖：最近录音移除、控制按钮左右排列、单屏无滚动、录音流程不变均由任务 1 覆盖。
- 无占位项或未决问题。
- 不新增类型或函数，现有 `useRecorder` 接口保持一致。
