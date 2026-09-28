// Exporting a flow and importing it back must give the same graph. Nothing asserted this: the 35 round-trip
// cases in @abuddy/sdk check selected fields of the exported DSL, so a step whose decompile stopped carrying a
// field would keep them green. This compares the entities on both sides instead, which is what a user loses.
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { compileFlowDSL, exportFlowsToDSL } from '@abuddy/sdk/build'
import { EARS, ROOT_FLOW_ROLE } from '@abuddy/sdk'
import { untypedQx } from '@abuddy/ears'
import { importFlows } from '@abuddy/testing/harness'
import { repository } from '#generated/repository.ts'
import { startTestRuntime } from '@abuddy/sdk/testing'
import { action, actionCode, branch, create, entry, fire, keepAlive, kill, llm, on, query, subflow, transform, update } from '#generated/flow-helpers.ts'

startTestRuntime()

const dirs: string[] = []
afterAll(() => { for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true }) })
const tmp = (): string => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'export-fidelity-')); dirs.push(dir); return dir }

/** Identity and bookkeeping, which the compiler mints fresh each pass */
const MINTED = new Set(['id', 'entityType', 'createdAt', 'updatedAt'])

const nodesByLabel = (rows: Record<string, unknown>[]): Map<string, Record<string, unknown>> =>
  new Map(rows.filter((row) => row.nodeType !== undefined).map((row) => [row.label as string, row]))

/** Every field that came back different, as `<nodeType>.<field>: <before> -> <after>` */
function drift(before: Map<string, Record<string, unknown>>, after: Map<string, Record<string, unknown>>): string[] {
  const out: string[] = []
  for (const [label, a] of before) {
    const b = after.get(label)
    if (b === undefined) { out.push(`${String(a.nodeType)}[${label}]: gone after re-import`); continue }
    for (const [key, value] of Object.entries(a)) {
      if (MINTED.has(key) || value === undefined) continue
      if (JSON.stringify(b[key]) !== JSON.stringify(value)) {
        out.push(`${String(a.nodeType)}.${key}: ${JSON.stringify(value)} -> ${JSON.stringify(b[key])}`)
      }
    }
  }
  return out.sort()
}

describe('a flow exported and imported back', () => {
  // Every option below is set to a *non-default* value on purpose: a field set to its default round-trips to
  // the same value even when nothing carries it, so the case would pass while covering nothing. Measured — with
  // `outputType: 'json'` here, deleting it from transform's decompile left this green.
  it('comes back as the same graph, but for the two differences recorded here', () => {
    importFlows({
      Every: {
        root: true,
        tracks: [
          entry([keepAlive()]),
          on('go', [[
            action('Send', { label: 'send', description: 'd', map: { to: '$.event.data.to' }, params: { x: 1 } }),
            actionCode('return ctx.a + 1', { label: 'compute' }),
            llm('Summarise', { label: 'sum', temperature: 0.2, maxTokens: 10 }),
            query('what?', { as: 'results' }),
            create('Note', { params: { content: 'c' } }),
            update('$.note', { params: { content: 'c' }, onMissing: 'ignore' }),
            transform('return 1', { outputType: 'text' }),
            fire('ping', { scope: 'global', payload: { a: 1 } }),
            subflow('Every', { inherit: false }),
            branch([{ if: 'ok == true', steps: [kill()] }], [keepAlive()]),
          ]]),
        ],
      },
    })
    const before = nodesByLabel(untypedQx(EARS.Entity.Node).pickAll() as Record<string, unknown>[])

    const { filePath, flowCount } = exportFlowsToDSL(tmp(), { rootFlowRole: ROOT_FLOW_ROLE }, false)
    const reimported = compileFlowDSL(JSON.parse(fs.readFileSync(filePath, 'utf-8')))
    const after = nodesByLabel(reimported.entity as Record<string, unknown>[])

    expect(flowCount, 'nothing exported, so everything below would pass over nothing').toBeGreaterThan(0)
    expect(before.size, 'no nodes compared, so this proves nothing about any step').toBeGreaterThan(8)
    expect(drift(before, after)).toEqual([
      // The entry role belongs to the first listener track, and a re-import has no first track to give it to.
      // `flow-round-trip.spec.ts` pins this from the other side.
      'listener.role: "entry_event" -> undefined',
      // A switch's else branch is labelled from the step type on the way in and from its title on the way back.
      // Cosmetic, and inside the condition list rather than on any node's own label, so no id moves.
      'switch.conditions: [{"predicate":{"key":"ok","operator":"equals","value":true},"label":"Kill Flow"},{"label":"keep_alive"}]'
        + ' -> [{"predicate":{"key":"ok","operator":"equals","value":true},"label":"Kill Flow"},{"label":"Keep Alive"}]',
    ])
  })
})

describe('a flow the export cannot write', () => {
  /**
   * A flow with no trigger has no track to hang its steps from, so there is no DSL for it. It used to be
   * dropped: a flow built in the editor and not yet triggered was simply missing from the file, with the
   * count saying nothing about it.
   */
  it('is named rather than missing, when it has no trigger to build a track from', () => {
    repository.flowsCommands.createFlow({ label: 'Not started yet' } as never)

    const { skipped, flowCount } = exportFlowsToDSL(tmp(), { rootFlowRole: ROOT_FLOW_ROLE }, false)

    expect(skipped).toContain('Not started yet')
    expect(flowCount, 'the skipped flow must not be counted as exported').toBe(0)
  })
})
