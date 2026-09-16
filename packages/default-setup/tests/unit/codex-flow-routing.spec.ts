// The Codex flow's tracks, run on the brain: which actions each event reaches, with which inputs.
// The Codex app server and the chat and threads services the actions drive are mocked.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockService, startApp, type FlowRun, type TestApp } from '@abuddy/testing/harness'
import type { Services } from '@/__generated__/services'
import { actionLabel, seedDefaultFlows } from './helpers/flows'

const actions = (run: FlowRun) => run.steps.map(actionLabel).filter(Boolean)
const step = (run: FlowRun, action: string) => run.steps.find((s) => actionLabel(s) === action)

let app: TestApp
beforeEach(async () => {
  seedDefaultFlows()
  mockService<Services, 'codex'>('codex', { status: 'ready', getHandle: vi.fn(), respondToApproval: vi.fn(), start: vi.fn() } as never)
  mockService<Services, 'chat'>('chat', { updateMessageState: vi.fn(), sendBlockMessage: vi.fn() } as never)
  mockService<Services, 'threads'>('threads', { updateChatState: vi.fn() } as never)
  app = await startApp({ systems: ['brain', 'settings'] })
})

describe('codex flow routing', () => {
  it('pauses without requiring a mode payload', async () => {
    const run = await app.runFlow('Codex', { event: 'user.thread.pause', data: { threadId: 'Thread-1' } })

    expect(actions(run)).toEqual(['CDX: Pause Turn'])
    expect(step(run, 'CDX: Pause Turn')?.params).toEqual({ threadId: 'Thread-1' })
  })

  it('unqueues without requiring a mode payload', async () => {
    const run = await app.runFlow('Codex', { event: 'user.thread.unqueue', data: { threadId: 'Thread-1', messageId: 'Message-1' } })

    expect(actions(run)).toEqual(['CDX: Unqueue Message'])
    expect(step(run, 'CDX: Unqueue Message')?.params).toMatchObject({ messageId: 'Message-1' })
  })

  it.each([
    ['revert', 'CDX: Handle Revert'],
    ['summarize', 'CDX: Handle Summarize'],
    ['rewind', 'CDX: Handle Rewind Unsupported'],
  ])('routes a Codex %s through the pause step to %s', async (kind, handler) => {
    const run = await app.runFlow('Codex', {
      event: 'thread.revert',
      data: { agents: { codex: true }, kind, threadId: 'Thread-1', messageId: 'Message-1' },
    })

    expect(actions(run)).toEqual(['CDX: Pause Turn', handler])
    expect(step(run, handler)?.params).toMatchObject({ threadId: 'Thread-1', messageId: 'Message-1' })
  })

  it("doesn't handle a revert of a thread without a Codex agent", async () => {
    const run = await app.runFlow('Codex', { event: 'thread.revert', data: { agents: { codex: false }, kind: 'revert', threadId: 'Thread-1' } })
    expect(actions(run)).toEqual([])
  })

  it('routes Codex forks', async () => {
    const run = await app.runFlow('Codex', { event: 'thread.fork', data: { newThreadId: 'Thread-2', sourceUserMessagesAfterFork: 2 } })

    expect(actions(run)).toEqual(['CDX: Handle Fork'])
    expect(step(run, 'CDX: Handle Fork')?.params).toMatchObject({ newThreadId: 'Thread-2', sourceUserMessagesAfterFork: 2 })
  })
})
