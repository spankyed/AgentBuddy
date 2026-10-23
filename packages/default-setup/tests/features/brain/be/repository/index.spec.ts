import { describe, expect, it } from 'vitest'
import { repository } from '#generated/repository.ts'
import { services } from '#generated/services.ts'
import type { EARS } from '#generated/ears.ts'

describe('brainCommands starting run nodes', () => {
  it('starts an event node under the flow run that heard it, with its payload, its trigger and the flow it walks', () => {
    const flowRun = services.runHistory.start({ kind: 'flow', label: 'Root', flowId: 'Flow-root' as EARS.EntityId })

    const event = repository.brainCommands.createEventRunNode(
      { id: 'Node-trigger', label: 'go', eventType: 'go' },
      flowRun.id,
      { text: 'hello' },
    )

    expect(services.runHistory.get(event.id)).toMatchObject({
      kind: 'event', status: 'active', parentId: flowRun.id, rootId: flowRun.id,
      nodeId: 'Node-trigger', flowId: 'Flow-root', triggerType: 'listener', nodeAttributes: { text: 'hello' },
    })
  })
})
