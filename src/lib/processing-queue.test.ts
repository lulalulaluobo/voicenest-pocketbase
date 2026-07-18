import { describe, expect, it } from 'vitest'
import { createSerialTaskRunner, shouldRetryProcessingError } from './processing-queue'

describe('processing queue', () => {
  it('runs different recordings one at a time', async () => {
    const run = createSerialTaskRunner()
    const events: string[] = []
    let releaseFirst: () => void = () => undefined
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve })

    const first = run('first', async () => {
      events.push('first:start')
      await firstGate
      events.push('first:end')
    })
    const second = run('second', async () => {
      events.push('second:start')
      events.push('second:end')
    })

    expect(events).toEqual(['first:start'])
    releaseFirst()
    await Promise.all([first, second])
    expect(events).toEqual(['first:start', 'first:end', 'second:start', 'second:end'])
  })

  it('joins duplicate processing requests and only runs once', async () => {
    const run = createSerialTaskRunner()
    let calls = 0
    const task = async () => { calls += 1 }

    await Promise.all([run('same', task), run('same', task)])

    expect(calls).toBe(1)
  })

  it('marks transient API failures as retryable', () => {
    expect(shouldRetryProcessingError(new TypeError('Failed to fetch'))).toBe(true)
    expect(shouldRetryProcessingError(new Error('ASR API 调用失败 (503)'))).toBe(true)
    expect(shouldRetryProcessingError(new Error('ASR API 调用失败 (401)'))).toBe(false)
  })
})
