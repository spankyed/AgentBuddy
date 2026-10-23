// What a step runs on reaches it whole: its params, and its settings with their mappings applied. The run node
// keeps a bounded copy for display; running on that copy made a create or update step persist a cut-off string,
// or a `{ value, _truncated }` wrapper in place of a long array, and an llm step send a cut-off prompt.
import { describe, expect, it } from 'vitest'
import { importFlows, mockInference, startApp } from '@apackdev/testing/harness'
import { action, entry, keepAlive, on } from '#generated/flow-helpers.ts'
import { repository } from '#generated/repository.ts'
import { untypedQuery } from '@apackdev/sdk/ears'

/** Past MAX_STRING_LENGTH (10 KB) and MAX_ARRAY_ITEMS (100) in the result truncator */
const LONG_TEXT_LENGTH = 20_000
const LONG_LIST_LENGTH = 150

const noteRows = () => untypedQuery('SearchIndex').pickAll() as Array<Record<string, unknown>>

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
          { type: 'create', entity: 'SearchIndex', label: 'mk', map: { content: '$.lastStep.result.text', tags: '$.lastStep.result.items' } },
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
  it('write a long string whole, not cut off at the run node limit', async () => {
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

  it('still bound the run node copy the UI reads', async () => {
    const app = await runCreateWithBigFields()

    const big = app.flowSteps('Outer').find((step) => step.label === 'big')!
    // The run node keeps each oversized field as a `{ value, _truncated }` marker, so a run node stays bounded
    const result = big.result as { text: { value: string; _truncated?: boolean } }
    expect(result.text._truncated).toBe(true)
    expect(result.text.value.length).toBeLessThan(LONG_TEXT_LENGTH)
  })

  it('send a long mapped prompt to the model whole', async () => {
    const inference = mockInference('ok')
    repository.actionCommands.create({ label: 'Long', actionFn: `return { text: 'x'.repeat(${LONG_TEXT_LENGTH}) }` })
    importFlows({
      Outer: {
        root: true,
        tracks: [
          entry([keepAlive()]),
          on('go', [[
            action('Long', { label: 'long' }),
            { type: 'llm', label: 'ask', prompt: 'placeholder', map: { prompt: '$.lastStep.result.text' } },
          ]]),
        ],
      },
    })
    const app = await startApp({ systems: ['brain'] })
    await app.runFlow('Outer', { event: 'go' })
    await app.settle()

    const [call] = inference.calls as unknown as Array<{ messages: Array<{ text: string }> }>
    expect(call.messages[0].text).toHaveLength(LONG_TEXT_LENGTH)
    // What the run node records of it is the bounded copy, marked
    const ask = app.flowSteps('Outer').find((step) => step.label === 'ask')!
    expect((ask.nodeAttributes.prompt as { _truncated?: boolean })._truncated).toBe(true)
  })
})
