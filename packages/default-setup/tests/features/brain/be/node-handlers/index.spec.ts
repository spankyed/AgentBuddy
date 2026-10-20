// A step whose type no running pack provides fails with a recorded error, rather than completing as if it had run
import { expect, it } from 'vitest'
import { takeSystemErrors } from '@apackdev/sdk/testing'
import { executeNode } from '#features/brain/be/node-handlers/index.ts'

it('fails a step no running pack provides, naming its type', async () => {
  const sent: Array<{ type: string; error?: { message?: string } }> = []
  const node = { id: 'Node-1', label: 'stamp it', nodeType: 'stamp', entityType: 'Node' }
  executeNode({ id: 'TNode-1' } as never, node as never, { flowTNodeId: 'TNode-0', runtime: {} } as never, { send: (event: never) => sent.push(event) })

  await Promise.resolve()
  expect(sent.map(event => event.type)).toEqual(['ERROR'])
  expect(String(sent[0].error?.message ?? sent[0].error)).toContain('No running pack provides step type "stamp"')
  takeSystemErrors()
})
