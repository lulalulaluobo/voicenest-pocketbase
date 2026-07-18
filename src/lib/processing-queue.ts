export function createSerialTaskRunner() {
  let pending = 0
  let tail = Promise.resolve()
  const active = new Map<string, Promise<void>>()

  return (id: string, task: () => Promise<void>): Promise<void> => {
    const existing = active.get(id)
    if (existing) return existing

    pending += 1
    const scheduled = pending === 1 ? task() : tail.then(task, task)
    const tracked = scheduled.finally(() => {
      pending -= 1
      active.delete(id)
    })
    active.set(id, tracked)
    tail = tracked.catch(() => undefined)
    return tracked
  }
}

export function shouldRetryProcessingError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return error instanceof TypeError
    || (error instanceof DOMException && error.name === 'AbortError')
    || /failed to fetch|network|timeout|\((408|429|5\d\d)\)/i.test(message)
}
