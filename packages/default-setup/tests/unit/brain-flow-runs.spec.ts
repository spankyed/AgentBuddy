// Flows on the brain through @abuddy/testing's runFlow: waiting steps, schedule ticks through the
// scheduler service, the trace of a flow's steps, and what runFlow needs
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockService, startApp, type TestApp } from '@abuddy/testing/harness'
import { entry, on, keepAlive, schedule, transform } from '@/__generated__/flow-helpers'
import { EARS, findWhere } from '@/__generated__/ears'
import { repository } from '@/__generated__/repository'
import type { Services } from '@/__generated__/services'
import { importFlows } from './helpers/flows'

const step = (label: string) => transform('return true', { label })

let app: TestApp
beforeEach(async () => {
  app = await startApp({ systems: ['brain', 'settings'] })
})

describe('runFlow', () => {
  it('runs a flow entry, finishing a track whose other step waits by design (keep-alive)', async () => {
    importFlows({ 'Long Running': [entry([step('setup'), step('ready')], [keepAlive('stay')])] })
    const run = await app.runFlow('Long Running')

    expect(run.steps.map((s) => [s.label, s.status])).toEqual([['setup', 'completed'], ['stay', 'active'], ['ready', 'completed']])
  })

  it('runs every step of a track in order, with each step completed', async () => {
    importFlows({ Chain: [on('go', [[step('first'), step('second'), step('third')]])] })
    const run = await app.runFlow('Chain', { event: 'go' })

    expect(run.steps.map((s) => [s.label, s.status])).toEqual([['first', 'completed'], ['second', 'completed'], ['third', 'completed']])
    expect(app.flowTrace('Chain').map((s) => s.label)).toEqual(['first', 'second', 'third'])
  })

  it('fails naming what it needs: the flow, a track for the event, the brain', async () => {
    importFlows({ Chain: [on('go', [[step('first')]])] })
    await expect(app.runFlow('Missing')).rejects.toThrow('No flow "Missing". Flows: Chain')
    await expect(app.runFlow('Chain', { event: 'stop' })).rejects.toThrow('Flow "Chain" has no track for "stop"')
    const withoutBrain = await startApp({ systems: ['settings'] })
    await expect(withoutBrain.runFlow('Chain', { event: 'go' })).rejects.toThrow("start the app with the brain and settings systems")
  })
})

describe('schedule triggers', () => {
  it('run on the ticks the scheduler service fires', async () => {
    const ticks = new Map<string, () => void>()
    // The schedule trigger loads its runtime before registering: resolved when the scheduler gets the job
    let registered!: () => void
    const scheduled = new Promise<void>((resolve) => { registered = resolve })
    mockService<Services, 'scheduler'>('scheduler', {
      registerSchedule: vi.fn((key: string, _cron: string, tick: () => void) => { ticks.set(key, tick); registered() }),
      unregisterByPrefix: vi.fn(),
      clearAllSchedules: vi.fn(),
    })
    importFlows({ Nightly: [schedule('0 3 * * *', [[step('cleanup')]])] })
    repository.flowsCommands.grantRootFlowRole(findWhere(EARS.Entity.Flow, 'label', 'Nightly')[0].id)
    await app.connect()
    await app.send('brain', { type: 'RESTART_BRAIN' })
    await scheduled

    expect([...ticks.keys()]).toEqual([expect.stringMatching(/^TNode-Root:/)])
    expect(app.flowTrace('Nightly')).toEqual([])

    for (const tick of ticks.values()) tick()
    await app.settle()
    expect(app.flowTrace('Nightly').map((s) => [s.label, s.status])).toEqual([['cleanup', 'completed']])
  })
})
