/**
 * The kill step, which had no test of any kind while `onboarding-flow.ts` shipped it to every user: two
 * `kill()` calls end that flow, so whether it stops the flow is the thing the onboarding run depends on.
 */
import { describe, expect, it } from 'vitest'
import { importFlows, startApp, type FlowRun } from '@apack/testing/harness'
import { kill, on, transform } from '#generated/flow-helpers.ts'
import { killStepBuild } from '#extensions/steps/kill/build.ts'

const { compile, getLabel } = killStepBuild
// `decompile` is optional on the facet; kill declares one, and these cases are what says so
const decompile = killStepBuild.decompile!

const run = async (label: string, steps: unknown[]): Promise<FlowRun> => {
  importFlows({ [label]: { root: true, tracks: [on('go', [steps as never])] } })
  const app = await startApp({ systems: ['brain'] })
  return app.runFlow(label, { event: 'go', data: {} })
}

describe('the kill step, on the brain', () => {
  it('ends the flow, so a step after it never runs', async () => {
    const flow = await run('Kills', [transform('return 1', { label: 'before' }), kill(), transform('return 2', { label: 'after' })])

    expect(flow.steps.map((step) => step.label)).toEqual(['before', 'Kill Flow'])
  })

  it('completes itself, rather than leaving the chain hanging', async () => {
    const flow = await run('Kills and completes', [kill()])

    expect(flow.steps.find((step) => step.label === 'Kill Flow')?.nodeAttributes.result).toEqual({ killed: true })
  })
})

describe('the kill step, compiled', () => {
  const ctx = { actions: new Map(), prompts: new Map(), flows: new Map() }

  it('takes the label it was given, and names itself when it was given none', () => {
    expect(compile({ type: 'kill', label: 'Stop here' }, 'n1', 1, ctx).entity)
      .toMatchObject({ nodeType: 'kill', label: 'Stop here' })
    expect(compile({ type: 'kill' }, 'n2', 1, ctx).entity).toMatchObject({ label: 'Kill Flow' })
  })

  it('round-trips its label and description, and emits neither when it has neither', () => {
    expect(decompile({ nodeType: 'kill', label: 'Stop here', description: 'why' }, {} as never))
      .toEqual({ type: 'kill', label: 'Stop here', description: 'why' })
    // The compiler gives every kill node the default label, so an export that echoed it would put a label on
    // every `kill()` the author wrote without one
    expect(decompile({ nodeType: 'kill' }, {} as never)).toEqual({ type: 'kill' })
  })

  it('labels an unlabelled step by its position, for the editor listing', () => {
    expect(getLabel({ type: 'kill' }, 3)).toBe('Kill Flow 3')
    expect(getLabel({ type: 'kill', label: 'mine' }, 3)).toBe('mine')
  })
})
