// A mapping's fallback, end to end: `map: { field: { source, default } }` through the compiler and into what
// the step writes.
//
// The runtime has applied a mapping's `default` since long before this spec (`node-attribute-mappers.ts`), but
// nothing could set one — the DSL typed `map` as `Record<string, string>` and the editor's forms wrote only a
// target and a source. So the branch had no producer, and a review could not tell the code from dead code by
// reading it. These cases are what makes it reachable; with the long form removed from `expandRecord` the first
// one fails.
import { describe, expect, it } from 'vitest'
import { importFlows, startApp } from '@abuddy/testing/harness'
import { entry, keepAlive, on } from '#generated/flow-helpers.ts'
import { untypedQx } from '@abuddy/ears'

const notes = () => untypedQx('Note').pickAll() as Array<Record<string, unknown>>

/** One create step, whose `content` is mapped from `source` with `fallback` to fall back on */
async function runWithMapping(source: string, fallback?: unknown) {
  importFlows({
    Outer: {
      root: true,
      tracks: [
        entry([keepAlive()]),
        on('go', [[
          {
            type: 'create',
            entity: 'Note',
            label: 'mk',
            map: { content: fallback === undefined ? source : { source, default: fallback } },
          },
        ]]),
      ],
    },
  })
  const app = await startApp({ systems: ['brain'] })
  await app.runFlow('Outer', { event: 'go', data: { present: 'from the event' } })
  await app.settle()
  return app
}

describe('a mapping with a fallback', () => {
  it('writes the fallback when the source resolves to nothing', async () => {
    await runWithMapping('$.event.data.payload.absent', 'the fallback')

    expect(notes().at(-1)!.content).toBe('the fallback')
  })

  it('writes the source when it does resolve, leaving the fallback alone', async () => {
    await runWithMapping('$.event.data.payload.present', 'the fallback')

    expect(notes().at(-1)!.content).toBe('from the event')
  })

  // The case the fallback exists for: without one, a source that resolves to nothing writes nothing, and the
  // short form is still what every written flow writes
  it('writes nothing when the source misses and no fallback is given', async () => {
    await runWithMapping('$.event.data.payload.absent')

    expect(notes().at(-1)!.content).toBeUndefined()
  })
})
