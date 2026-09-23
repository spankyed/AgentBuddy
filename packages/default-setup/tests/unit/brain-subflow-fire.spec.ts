// What a subflow starts with (inherit, map) and what a fire step sends (payload mappings, scope), on the brain
// through @abuddy/testing, as the app runs flows.
import { describe, expect, it } from 'vitest'
import { importFlows, startApp } from '@abuddy/testing/harness'
import { action, entry, fire, keepAlive, on, subflow, transform } from '@/__generated__/flow-helpers'
import { repository } from '@/__generated__/repository'
import { listen, type BrainEventPayload } from '@/features/brain/be/services/brain'

const startBrain = () => startApp({ systems: ['brain'] })
const step = (label: string) => transform('return true', { label })

/** An action whose result is `result`, and one that returns its params */
function createActions(result: Record<string, unknown>) {
  repository.actionCommands.create({ label: 'Const', actionFn: `return ${JSON.stringify(result)}` })
  repository.actionCommands.create({ label: 'Echo', actionFn: 'return params' })
}

describe('subflow context', () => {
  /** Inner's entry step reads the event data, the last step and a step by label */
  const reads = action('Echo', {
    label: 'read',
    map: { text: '$.event.data.payload.text', prev: '$.lastStep.result.color', prep: '$.steps[label=prep].result.color' },
  })
  const run = async (subflowStep: ReturnType<typeof subflow>) => {
    createActions({ color: 'red', text: 'from parent step' })
    importFlows({
      Outer: { root: true, tracks: [on('go', [[action('Const', { label: 'prep' }), subflowStep]])] },
      Inner: [entry([reads])],
    })
    const app = await startBrain()
    await app.runFlow('Outer', { event: 'go', data: { text: 'hi' } })
    await app.settle()
    const [read] = app.flowTrace('Inner')
    expect(read).toMatchObject({ label: 'read', status: 'completed' })
    return read.params
  }

  it("starts the child's entry track with the parent's event data and steps when it inherits (the default)", async () => {
    expect(await run(subflow('Inner'))).toEqual({ text: 'hi', prev: 'red', prep: 'red' })
  })

  it("starts it with neither without inherit", async () => {
    expect(await run(subflow('Inner', { inherit: false }))).toEqual({ text: undefined, prev: undefined, prep: undefined })
  })

  it("lets a mapped field win over the parent's event data", async () => {
    expect(await run(subflow('Inner', { map: { payload: '$.lastStep.result' } }))).toEqual({ text: 'from parent step', prev: 'red', prep: 'red' })
  })

  it('gives a child without inherit only its mapped fields', async () => {
    expect(await run(subflow('Inner', { inherit: false, map: { payload: '$.lastStep.result' } }))).toEqual({ text: 'from parent step', prev: undefined, prep: undefined })
  })
})

describe('fire', () => {
  it('sends its payload with the mappings in it resolved, at any depth', async () => {
    createActions({ color: 'red' })
    importFlows({
      Outer: {
        root: true,
        tracks: [
          entry([keepAlive()]),
          on('go', [[
            action('Const', { label: 'prep' }),
            fire('done', { label: 'notify', payload: { color: '$.lastStep.result.color', nested: ['$.event.data.payload.text', { step: '$.steps[label=prep].result' }], literal: 'plain', count: 2 } }),
          ]]),
          on('done', [[action('Echo', { label: 'heard', map: { payload: '$.event.data.payload' } })]]),
        ],
      },
    })
    const app = await startBrain()

    await app.runFlow('Outer', { event: 'go', data: { text: 'hi' } })
    await app.settle()

    const heard = app.flowTrace('Outer').find((s) => s.label === 'heard')
    expect(heard?.params.payload).toEqual({ color: 'red', nested: ['hi', { step: { color: 'red' } }], literal: 'plain', count: 2 })
  })

  it('sends a payload that is a single mapping as its value', async () => {
    createActions({ color: 'red' })
    importFlows({
      Outer: {
        root: true,
        tracks: [
          entry([keepAlive()]),
          on('go', [[action('Const', { label: 'prep' }), fire('done', { label: 'notify', payload: '$.lastStep.result' })]]),
          on('done', [[action('Echo', { label: 'heard', map: { payload: '$.event.data.payload' } })]]),
        ],
      },
    })
    const app = await startBrain()

    await app.runFlow('Outer', { event: 'go' })
    await app.settle()

    expect(app.flowTrace('Outer').find((s) => s.label === 'heard')?.params.payload).toEqual({ color: 'red' })
  })

  it.each([
    { scope: 'local' as const, heardBy: ['A'] },
    { scope: 'global' as const, heardBy: ['A', 'B'] },
  ])('$scope: reaches the tracks of $heardBy, and services.brain listeners with the target flow', async ({ scope, heardBy }) => {
    importFlows({
      'Root Flow': { root: true, tracks: [entry([subflow('A')], [subflow('B')], [keepAlive()])] },
      A: [entry([keepAlive()]), on('go', [[fire('ping', { label: 'fire ping', scope })]]), on('ping', [[step('A heard')]])],
      B: [entry([keepAlive()]), on('ping', [[step('B heard')]])],
    })
    const heard: BrainEventPayload[] = []
    listen('ping', (event) => { heard.push(event) })
    const app = await startBrain()

    await app.runFlow('A', { event: 'go' })
    await app.settle()

    const labels = (flow: string) => app.flowTrace(flow).map((s) => s.label)
    expect(['A', 'B'].filter((flow) => labels(flow).includes(`${flow} heard`))).toEqual(heardBy)
    const fired = app.flowTrace('A').find((s) => s.label === 'fire ping')?.nodeAttributes.result as { targetFlowId?: string }
    // A local event names the flow it was sent to, so a listener can tell it from a global one
    expect(heard).toEqual([{ type: 'ping', payload: undefined, targetFlowId: scope === 'local' ? expect.stringMatching(/^TNode/) : undefined }])
    expect(heard[0].targetFlowId).toBe(fired.targetFlowId)
  })
})
