// A flow spawns a child actor per step and per subflow, each under a `step-tnode-…`/`flow-tnode-…` id.
// XState tracks a parent's children by their own id, so each spawn names one: without it they share a key,
// the parent holds only the last, and stopping the flow leaves the rest running.
import { describe, expect, it } from 'vitest'
import { importFlows, startApp } from '@abuddy/testing/harness'
import { entry, keepAlive, on, transform } from '@/__generated__/flow-helpers'
import { getFlowActor } from '@/features/brain/be/flow-system'

const ROOT_FLOW_TNODE = 'TNode-Root'
const step = (label: string) => transform('return true', { label })

/** The keys the root flow tracks its spawned children by */
function childKeys(): string[] {
  const actor = getFlowActor(ROOT_FLOW_TNODE as never)
  expect(actor, 'the root flow actor is running').toBeDefined()
  return Object.keys(actor.getSnapshot().children as Record<string, unknown>)
}

describe('a flow’s spawned children', () => {
  it('are tracked by their own ids, one per step, not collapsed onto a single key', async () => {
    importFlows({
      Outer: { root: true, tracks: [entry([keepAlive()]), on('go', [[step('one'), step('two'), step('three')]])] },
    })
    const app = await startApp({ systems: ['brain'] })

    await app.runFlow('Outer', { event: 'go' })
    await app.settle()

    const keys = childKeys()
    expect(keys, `children were ${JSON.stringify(keys)}`).not.toContain('undefined')
    expect(new Set(keys).size).toBe(keys.length)
  })
})
