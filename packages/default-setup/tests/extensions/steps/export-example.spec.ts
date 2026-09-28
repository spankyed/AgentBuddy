// The worked example of the flow DSL export format, recorded rather than written.
//
// There used to be a hand-kept one at `src/features/flows/be/dsl/examples/exported-flows.json`. Nothing read
// it, nothing regenerated it, and of its five commits one was about its content and four were renames — so it
// drifted until it used `steps:` where `Track` has `exits` and `"type": "flow"` where the step is `subflow`,
// and no check could have said so. This is the same artifact derived from the exporter instead: what
// `exportFlowsToDSL` writes for a flow using every step this pack registers.
//
// A golden and not an assertion on selected fields, for the reason `tests/seeds/CLAUDE.md` gives: what a
// reader needs from an example is the whole shape, and a diff of the whole file is what says it moved.
//
// Its own file rather than a case in `export-fidelity.spec.ts`, which shares that fixture: that spec's second
// describe creates another flow through the repository on the same module-level runtime, so a golden built
// beside it would contain different flows depending on describe order.
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { exportFlowsToDSL } from '@abuddy/sdk/build'
import { ROOT_FLOW_ROLE } from '@abuddy/sdk'
import { importFlows } from '@abuddy/testing/harness'
import { population } from '@abuddy/sdk/testing'
import { startTestRuntime } from '@abuddy/sdk/testing'
import { steps as registeredSteps } from '#extensions/steps/register.ts'
import { EVERY_STEP_FLOW } from '../../_support/every-step-flow.ts'

startTestRuntime()

const GOLDEN = path.join(import.meta.dirname, '__golden__', 'exported-flows.json')
const UPDATE = process.env.UPDATE_FLOW_EXAMPLE === '1'

const dirs: string[] = []
afterAll(() => { for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true }) })

/** The exporter's own output for the shared fixture, read back as the file it wrote */
function exported(): unknown {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'export-example-'))
  dirs.push(dir)
  const { filePath, flowCount } = exportFlowsToDSL(dir, { rootFlowRole: ROOT_FLOW_ROLE }, false)
  expect(flowCount, 'nothing was exported, so the golden would record an empty file').toBeGreaterThan(0)
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
}

/**
 * What the example actually shows, derived from the export rather than from the fixture: the step types
 * reached through every track, and the triggers, identified by the Track key each trigger facet declares it
 * owns (`trigger.trackField`).
 *
 * The walk follows nesting through the step's own `branches` facet (`StepBranch`, `@abuddy/sdk/steps`), which
 * is the declared answer to "which keys of this node hold more steps". Without it this finds ten of eleven:
 * `kill` sits inside the switch's `conditions[].steps` and a second `keep_alive` inside its `else`, so a walk
 * that reads only `exits` reports a shorter list and blames the fixture for it.
 */
function shownBy(dsl: Record<string, unknown>): { steps: Set<string>; triggers: Set<string> } {
  const byType = new Map(registeredSteps.map((step) => [step.type, step]))
  const walk = (nodes: Record<string, unknown>[]): string[] => nodes.flatMap((node) => {
    const nested = byType.get(node.type as string)?.build?.branches?.(node)?.flatMap((branch) => branch.steps) ?? []
    return [node.type as string, ...walk(nested as Record<string, unknown>[])]
  })
  const steps = new Set<string>()
  const triggers = new Set<string>()
  for (const flow of Object.values(dsl)) {
    const tracks = (Array.isArray(flow) ? flow : (flow as { tracks: unknown[] }).tracks) as Record<string, unknown>[]
    for (const track of tracks) {
      for (const candidate of registeredSteps) {
        const field = candidate.trigger?.trackField
        if (field !== undefined && track[field] !== undefined) triggers.add(candidate.type)
      }
      for (const exit of (track.exits ?? []) as Record<string, unknown>[][]) for (const type of walk(exit)) steps.add(type)
    }
  }
  return { steps, triggers }
}

describe('the flow DSL export example', () => {
  it('is what the exporter writes for a flow using every step', () => {
    importFlows(EVERY_STEP_FLOW)
    const actual = exported()

    // Before the branch below, so an example missing a step cannot be *recorded* — only failing to compare
    // one would leave the docs pointing at a file that no longer shows what they say it shows
    const shown = shownBy(actual as Record<string, unknown>)
    const expectedSteps = registeredSteps.filter((step) => step.kind !== 'trigger').map((step) => step.type).sort()
    const expectedTriggers = registeredSteps.filter((step) => step.kind === 'trigger').map((step) => step.type).sort()
    population('the step types to expect', expectedSteps, { atLeast: 5 })
    population('the triggers to expect', expectedTriggers)
    expect([...shown.steps].sort(), 'the example is meant to show every step this pack registers, and these '
      + 'differ. Add the missing ones to tests/_support/every-step-flow.ts').toEqual(expectedSteps)
    expect([...shown.triggers].sort(), 'the example is meant to show every trigger this pack registers, and '
      + 'these differ. Add a track for the missing one to tests/_support/every-step-flow.ts').toEqual(expectedTriggers)

    if (UPDATE) {
      fs.mkdirSync(path.dirname(GOLDEN), { recursive: true })
      fs.writeFileSync(GOLDEN, `${JSON.stringify(actual, null, 2)}\n`)
      return
    }

    // Asserted rather than left to a missing-file write, for the reason tests/seeds/CLAUDE.md records: vitest's
    // own snapshot mode writes a missing snapshot and passes, and this repo's CI is off, so that mode would
    // silently record whatever the first run produced
    expect(fs.existsSync(GOLDEN), `missing golden ${path.relative(process.cwd(), GOLDEN)} — record it with `
      + 'npm run flow-export:update -w @app/default-setup').toBe(true)
    const golden = JSON.parse(fs.readFileSync(GOLDEN, 'utf-8')) as unknown
    expect(actual, 'the exported flow DSL moved. If that is the change you meant, re-record it deliberately —\n'
      + '  npm run flow-export:update -w @app/default-setup\n'
      + 'then read the git diff to confirm the format still reads the way an author needs. Never hand-edit it: '
      + 'the last hand-kept copy of this file drifted two releases behind the types.').toEqual(golden)
  })
})
