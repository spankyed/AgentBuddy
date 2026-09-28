// What a step runs on is `{ ...params, ...mapped }` (`node-attribute-mappers.ts`), so the two can name the same
// field and the mapping wins. These pin what happens when the mapping's source resolves to nothing — the case
// where "the mapping wins" is a question rather than an answer, since there is no mapped value to win with.
//
// Recorded before the behaviour changes, so the diff that changes it names exactly what moves.
import { describe, expect, it } from 'vitest'
import { importFlows, startApp } from '@abuddy/testing/harness'
import { entry, keepAlive, on } from '#generated/flow-helpers.ts'
import { untypedQx } from '@abuddy/ears'

const notes = () => untypedQx('Note' as never).pickAll() as Array<Record<string, unknown>>

/** A create step that sets `content` literally *and* maps it, so the two overlap on one field */
async function runWithBoth(map: Record<string, unknown>) {
  importFlows({
    Outer: {
      root: true,
      tracks: [
        entry([keepAlive()]),
        on('go', [[
          { type: 'create', entity: 'Note', label: 'mk', params: { content: 'the literal' }, map } as never,
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

  // The one worth pinning. A mapping whose source resolves to nothing still writes its target, as `undefined`,
  // and an own property set to `undefined` overrides the literal in a spread — so the step runs on nothing
  // rather than on the value the author typed beside it.
  it('writes nothing, not the literal, when the source misses and no fallback is given', async () => {
    await runWithBoth({ content: '$.event.data.payload.absent' })

    expect(notes().at(-1)!.content).toBeUndefined()
  })
})
