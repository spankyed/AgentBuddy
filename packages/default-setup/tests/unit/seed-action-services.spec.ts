// A seed action run by the action step reaches the app through `services`: it sends through services.emitter, logs
// through services.logger and writes through services.repository, all on the runtime the harness binds
import { expect, it, vi } from 'vitest'
import { mockService, startApp } from '@abuddy/testing/harness'
import { testRootEvents } from '@abuddy/sdk/testing'
import type { LogEvent } from '@abuddy/sdk/logger'
import type { EARS } from '@abuddy/sdk'
import { repository } from '@/__generated__/repository'
import type { Services } from '@/__generated__/services'
import { actionLabel, seedDefaultFlows } from './helpers/flows'

it("pauses a running Claude Code turn: CC: Pause Turn's event, log entry and thread row", async () => {
  seedDefaultFlows()
  // No CLI process runs in the test
  mockService<Services, 'cli'>('cli', { claudeCode: { getHandle: () => undefined, clearHandle: vi.fn() } } as never)
  mockService<Services, 'threads'>('threads', { updateChatState: vi.fn() } as never)
  vi.spyOn(console, 'info').mockImplementation(() => {})
  const { id } = repository.threadCommands.create({ topic: 'A running turn', instructions: '' })
  const threadId = id as EARS.EntityId
  const app = await startApp({ systems: ['brain', 'settings'] })
  await app.connect()
  // The Claude Code flow's entry track clears run state left over from a previous process: the turn starts after it
  await app.runFlow('Claude Code')
  repository.threadCommands.update(threadId, { context: { claudeCode: { sessionId: 'session-1', isRunning: true } } } as never)

  const logs: LogEvent[] = []
  const stopLogs = testRootEvents.onLog((event) => { logs.push(event) })
  const run = await app.runFlow('Claude Code', { event: 'user.thread.pause', data: { threadId } }).finally(stopLogs)

  expect(run.steps.map((step) => [actionLabel(step), step.status])).toEqual([['CC: Pause Turn', 'completed']])
  expect(app.emitted('threads')).toContainEqual(expect.objectContaining({
    type: 'THREAD_UPDATED',
    threadId,
    updates: expect.objectContaining({ context: { claudeCode: expect.objectContaining({ sessionId: 'session-1', isRunning: false }) } }),
  }))
  expect(logs).toContainEqual(expect.objectContaining({
    level: 'info',
    source: 'action:CC: Pause Turn',
    message: '[killTurn] entered',
    meta: expect.objectContaining({ threadId, hasPrior: true, isRunning: true }),
  }))
  const thread = repository.threadQueries.byId(threadId) as { context?: { claudeCode?: Record<string, unknown> } }
  expect(thread.context?.claudeCode).toMatchObject({ sessionId: 'session-1', isRunning: false })
})
