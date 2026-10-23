import { describe, expect, it } from 'vitest'
import { repository } from '#generated/repository.ts'
import { services } from '#generated/services.ts'
import type { TNodeId } from '@apackdev/sdk/steps'

/** A step node in the run history, as a running step leaves it */
function runningStep(): TNodeId {
  const id = services.runHistory.newId()
  services.runHistory.add({ id, tNodeType: 'step', label: 'Step', status: 'active', startedAt: 0 })
  return id
}

describe('brainCommands recording run nodes', () => {
  it('records a status, an end time and an event payload on a node the run history holds', () => {
    const id = runningStep()

    repository.brainCommands.updateTNodeStatus(id, 'completed')
    repository.brainCommands.updateTNodeAttributes(id, { payload: 1 })

    expect(services.runHistory.get(id)).toMatchObject({ status: 'completed', completedAt: expect.any(Number), nodeAttributes: { payload: 1 } })
  })

  it('records nothing for a node the run history does not hold', () => {
    const gone = 'TNode-gone' as TNodeId
    repository.brainCommands.updateTNodeStatus(gone, 'completed')
    repository.brainCommands.updateTNodeResult(gone, { ok: true })
    expect(services.runHistory.get(gone)).toBeUndefined()
  })

  it('stops what is still running, and keeps it in the run history', () => {
    const id = runningStep()

    repository.brainCommands.stopActive()

    expect(services.runHistory.get(id)).toMatchObject({ status: 'stopped', completedAt: expect.any(Number) })
  })
})
