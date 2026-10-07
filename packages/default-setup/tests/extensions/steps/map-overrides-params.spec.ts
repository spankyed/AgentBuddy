// What a step runs on is `{ ...params, ...mapped }` (`node-attribute-mappers.ts`), so the two can name the same
// field and the mapping wins. These pin what happens when the mapping's source resolves to nothing — the case
// where "the mapping wins" is a question rather than an answer, since there is no mapped value to win with.
//
// Recorded before the behaviour changes, so the diff that changes it names exactly what moves.
import { describe, expect, it } from 'vitest'
import { importFlows, startApp } from '@abuddy/testing/harness'
import { entry, fire, keepAlive, on } from '#generated/flow-helpers.ts'
import { untypedQx } from '@abuddy/ears'

const notes = () => untypedQx('Note').pickAll() as Array<Record<string, unknown>>

/** A create step that sets `content` literally *and* maps it, so the two overlap on one field */
async function runWithBoth(map: Record<string, unknown>) {
  importFlows({
    Outer: {
      root: true,
      tracks: [
        entry([keepAlive()]),
        on('go', [[
          { type: 'create', entity: 'Note', label: 'mk', params: { content: 'the literal' }, map },
        ]]),
      ],
    },
  })
  const app = await startApp({ systems: ['brain'] })
  await app.runFlow('Outer', { event: 'go', data: { present: 'from the event' } })
  await app.settle()
  return app
}

describe('a mapping and a literal params entry on one field', () => {
  it('takes the mapping when its source resolves', async () => {
    await runWithBoth({ content: '$.event.data.payload.present' })

    expect(notes().at(-1)!.content).toBe('from the event')
  })

  it('takes the fallback when the source misses and one is given', async () => {
    await runWithBoth({ content: { source: '$.event.data.payload.absent', default: 'the fallback' } })

    expect(notes().at(-1)!.content).toBe('the fallback')
  })

  // A mapping that resolved to nothing writes nothing, so the literal shows through. It used to write the
  // target as `undefined`, which overrides in a spread, and the step ran on nothing rather than on the value
  // the author had typed beside the mapping.
  it('leaves the literal alone when the source misses and no fallback is given', async () => {
    await runWithBoth({ content: '$.event.data.payload.absent' })

    expect(notes().at(-1)!.content).toBe('the literal')
  })
})

/**
 * The fire step is where this mattered most, because its fallback is not a spread: it asks whether the mapping
 * produced a `payload` at all (`'payload' in mapped`), and a target written as `undefined` answered yes. So a
 * flow whose payload mapping missed fired nothing, rather than the payload set beside it.
 */
describe('a fire step whose payload mapping resolves to nothing', () => {
  async function firePayload(source: string): Promise<unknown> {
    importFlows({
      Outer: {
        root: true,
        tracks: [
          entry([keepAlive()]),
          on('go', [[fire('ping', { payload: { a: 1 }, map: { payload: source } })]]),
        ],
      },
    })
    const app = await startApp({ systems: ['brain'] })
    await app.runFlow('Outer', { event: 'go', data: { present: 'from the event' } })
    await app.settle()
    const step = app.flowTrace('Outer').find((s) => s.label === 'ping')
    return (step?.nodeAttributes.result as { payload?: unknown } | undefined)?.payload
  }

  it('fires the payload set beside the mapping', async () => {
    expect(await firePayload('$.event.data.payload.absent')).toEqual({ a: 1 })
  })

  it('still fires the mapped value when the source resolves', async () => {
    expect(await firePayload('$.event.data.payload.present')).toBe('from the event')
  })
})
