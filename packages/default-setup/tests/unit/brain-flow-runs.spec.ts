// Flows on the brain through @abuddy/testing's runFlow: waiting steps, schedule ticks through the
// scheduler service, the trace of a flow's steps, and what runFlow needs
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockService, startApp, type TestApp } from '@abuddy/testing/harness'
import { action, entry, on, keepAlive, schedule, subflow, transform } from '@/__generated__/flow-helpers'
import { EARS, findWhere } from '@/__generated__/ears'
import { repository } from '@/__generated__/repository'
import type { Services } from '@/__generated__/services'
import { isBrainPaused } from '@/features/brain/be/utils/brain-pause'
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

  it("traces a subflow's steps under the flow's label, not the subflow step's", async () => {
    importFlows({
      Outer: [on('go', [[subflow('Inner', { label: 'run inner' })]])],
      Inner: [entry([step('i1'), step('i2')])],
    })
    await app.runFlow('Outer', { event: 'go' })

    expect(app.flowTrace('Inner').map((s) => s.label)).toEqual(['i1', 'i2'])
    expect(app.flowTrace('run inner')).toEqual([])
  })

  it('waits for steps an action step starts after it completes, however long they take', async () => {
    // A step with a runtime handler reports completion before its flow starts the next step
    repository.actionCommands.create({ label: 'Fast', actionFn: 'return { fast: true }' })
    repository.actionCommands.create({ label: 'Slow', actionFn: 'await new Promise((resolve) => setTimeout(resolve, 30)); return { slow: true }' })
    importFlows({ Chain: [on('go', [[action('Fast', { label: 'fast' }), action('Slow', { label: 'slow' }), step('last')]])] })

    const run = await app.runFlow('Chain', { event: 'go' })

    expect(run.steps.map((s) => [s.label, s.status])).toEqual([['fast', 'completed'], ['slow', 'completed'], ['last', 'completed']])
  })

  it('waits for slow steps beside a step that waits by design', async () => {
    repository.actionCommands.create({ label: 'Slow', actionFn: 'await new Promise((resolve) => setTimeout(resolve, 30)); return { slow: true }' })
    importFlows({ 'Long Running': [entry([keepAlive('stay')], [action('Slow', { label: 'first' }), action('Slow', { label: 'second' })])] })

    const run = await app.runFlow('Long Running')

    expect(run.steps.map((s) => [s.label, s.status]).sort()).toEqual([['first', 'completed'], ['second', 'completed'], ['stay', 'active']])
  })

  it('keeps to its timeout while the systems stay busy', async () => {
    importFlows({ Chain: [on('go', [[step('first')]])] })
    await app.connect()
    const busy = setInterval(() => app.system('brain').send({ type: 'TOGGLE_INSPECT' }), 1)
    const started = Date.now()
    try {
      await expect(app.runFlow('Chain', { event: 'go', timeoutMs: 100 })).rejects.toThrow('didn\'t finish "go" within 100ms')
    } finally {
      clearInterval(busy)
    }
    expect(Date.now() - started).toBeLessThan(500)
  })

  it('fails naming what it needs: the flow, a track for the event, the brain', async () => {
    importFlows({ Chain: [on('go', [[step('first')]])] })
    await expect(app.runFlow('Missing')).rejects.toThrow('No flow "Missing". Flows: Chain')
    await expect(app.runFlow('Chain', { event: 'stop' })).rejects.toThrow('Flow "Chain" has no track for "stop"')
    const withoutBrain = await startApp({ systems: ['settings'] })
    await expect(withoutBrain.runFlow('Chain', { event: 'go' })).rejects.toThrow("start the app with the brain and settings systems")
  })
})

describe('brain start', () => {
  const brainState = () => {
    const snapshot = app.system('brain').getSnapshot() as { matches(state: string): boolean; context: { brainActor?: unknown } }
    return { running: snapshot.matches('running'), hasActor: snapshot.context.brainActor !== undefined }
  }
  const firstFlowIsRoot = () => repository.flowsQueries.rootFlow() === findWhere(EARS.Entity.Flow, 'label', 'First')[0]?.id

  it('stops with no flow to run, and starts from START_BRAIN once a flow exists', async () => {
    expect(brainState()).toEqual({ running: false, hasActor: false })
    await app.connect()
    expect(app.emitted('brain').map((e) => e.type)).toContain('BRAIN_KILLED')

    importFlows({ First: [entry([keepAlive('stay')])] })
    await app.send('brain', { type: 'START_BRAIN' })

    expect(brainState()).toEqual({ running: true, hasActor: true })
    expect(firstFlowIsRoot()).toBe(true)
  })

  it('runs the first flow when flows exist but none has the root role', async () => {
    app.stop()
    importFlows({ First: [entry([keepAlive('stay')])] })
    expect(repository.flowsQueries.rootFlow()).toBeUndefined()

    app = await startApp({ systems: ['brain', 'settings'] })

    expect(firstFlowIsRoot()).toBe(true)
    expect(brainState()).toEqual({ running: true, hasActor: true })
  })

  it("doesn't carry a pause into a later start", async () => {
    importFlows({ First: [entry([keepAlive('stay')])] })
    await app.connect()
    await app.send('brain', { type: 'START_BRAIN' })
    await app.send('brain', { type: 'PAUSE_BRAIN' })
    expect(isBrainPaused()).toBe(true)
    app.stop()

    app = await startApp({ systems: ['brain', 'settings'] })

    expect(isBrainPaused()).toBe(false)
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
