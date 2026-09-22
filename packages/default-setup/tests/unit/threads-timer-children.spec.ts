// The threads plugin clears a new thread's flag and a flashed chat state on a timer, each a child actor. A timer
// leaves the plugin's children once it fires, and a later timer for the same thread replaces the earlier one.
import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createActor } from 'xstate'
import { startFeTestRuntime } from '@abuddy/sdk/testing'
import threadsState from '@/features/threads/fe/state'

// The plugin's module tracks the mouse for its hotkeys as it loads; the test setup's window is a bare stand-in
vi.hoisted(() => { (globalThis as { addEventListener?: unknown }).addEventListener ??= () => {} })

afterAll(startFeTestRuntime({ transport: { sendIncoming() {} } }))
beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

const children = (actor: ReturnType<typeof startThreads>) => Object.keys(actor.getSnapshot().children)

function startThreads() {
  return createActor(threadsState).start()
}

it('drops the new-thread timer once it clears the flag', () => {
  const actor = startThreads()
  actor.send({ type: 'THREAD_CREATED', id: 't1', shortCode: 'T1', entityType: 'Thread', timestamp: 0 } as never)
  expect(children(actor)).toContain('clear-new-thread-flag-t1')

  vi.advanceTimersByTime(1000)

  expect(children(actor)).not.toContain('clear-new-thread-flag-t1')
  expect(actor.getSnapshot().context.threadMap['t1']?.isNew).toBe(false)
})

it('drops the chat state timer once the override expires', () => {
  const actor = startThreads()
  actor.send({ type: 'FLASH_CHAT_STATE', threadId: 't1', stateId: 'saved', durationMs: 500 })
  expect(children(actor)).toContain('clear-expired-override-t1')

  vi.advanceTimersByTime(500)

  expect(children(actor)).not.toContain('clear-expired-override-t1')
  expect(actor.getSnapshot().context.chatStateOverrides['t1']).toBeUndefined()
})

it("keeps a thread's later chat state override until its own timer, not the earlier one's", () => {
  const actor = startThreads()
  actor.send({ type: 'FLASH_CHAT_STATE', threadId: 't1', stateId: 'first', durationMs: 500 })
  vi.advanceTimersByTime(300)
  actor.send({ type: 'FLASH_CHAT_STATE', threadId: 't1', stateId: 'second', durationMs: 500 })

  vi.advanceTimersByTime(300)
  expect(actor.getSnapshot().context.chatStateOverrides['t1']?.id).toBe('second')

  vi.advanceTimersByTime(200)
  expect(actor.getSnapshot().context.chatStateOverrides['t1']).toBeUndefined()
  expect(children(actor)).not.toContain('clear-expired-override-t1')
})
