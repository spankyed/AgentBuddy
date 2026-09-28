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
import { startTestRuntime } from '@abuddy/sdk/testing'
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

describe('the flow DSL export example', () => {
  it('is what the exporter writes for a flow using every step', () => {
    importFlows(EVERY_STEP_FLOW)
    const actual = exported()

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
