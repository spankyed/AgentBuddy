// A step's resolved params are what it runs on and writes, so they reach it whole. The trace copy
// (nodeAttributes) is truncated to bound the trace's size; truncating the params too made a create or
// update step persist a cut-off string, or a `{ value, _truncated }` wrapper in place of a long array.
import { describe, expect, it } from 'vitest'
import { importFlows, startApp } from '@abuddy/testing/harness'
import { action, entry, keepAlive, on } from '@/__generated__/flow-helpers'
import { repository } from '@/__generated__/repository'
import { untypedQx } from '@abuddy/ears'

/** Past MAX_STRING_LENGTH (10 KB) and MAX_ARRAY_ITEMS (100) in the trace truncator */
const LONG_TEXT_LENGTH = 20_000
const LONG_LIST_LENGTH = 150

const noteRows = () => untypedQx('Note' as never).pickAll() as Array<Record<string, unknown>>

/** A flow whose first step returns oversized data, mapped into a create step's fields */
async function runCreateWithBigFields() {
  repository.actionCommands.create({
    label: 'Big',
    actionFn: `return { text: 'x'.repeat(${LONG_TEXT_LENGTH}), items: Array.from({ length: ${LONG_LIST_LENGTH} }, (_, i) => i) }`,
  })
  importFlows({
    Outer: {
      root: true,
      tracks: [
        entry([keepAlive()]),
        on('go', [[
          action('Big', { label: 'big' }),
          { type: 'create', entity: 'Note', label: 'mk', map: { content: '$.lastStep.result.text', tags: '$.lastStep.result.items' } } as never,
        ]]),
      ],
    },
  })
  const app = await startApp({ systems: ['brain'] })
  await app.runFlow('Outer', { event: 'go' })
  await app.settle()
  return app
}

describe('the params a step runs on', () => {
  it('write a long string whole, not cut off at the trace limit', async () => {
    await runCreateWithBigFields()

    const note = noteRows().at(-1)!
    expect(typeof note.content).toBe('string')
    expect((note.content as string).length).toBe(LONG_TEXT_LENGTH)
    expect(note.content as string).not.toContain('...')
  })

  it('write a long array as an array, not as a truncation wrapper', async () => {
    await runCreateWithBigFields()

    const note = noteRows().at(-1)!
    expect(Array.isArray(note.tags), `tags were ${JSON.stringify(note.tags).slice(0, 120)}`).toBe(true)
    expect(note.tags as unknown[]).toHaveLength(LONG_LIST_LENGTH)
  })

  it('still bound the trace copy the UI reads', async () => {
    const app = await runCreateWithBigFields()

    const big = app.flowTrace('Outer').find((step) => step.label === 'big')!
    // The trace keeps each oversized field as a `{ value, _truncated }` marker, so a run's trace stays bounded
    const result = big.nodeAttributes.result as { text: { value: string; _truncated?: boolean } }
    expect(result.text._truncated).toBe(true)
    expect(result.text.value.length).toBeLessThan(LONG_TEXT_LENGTH)
  })
})
