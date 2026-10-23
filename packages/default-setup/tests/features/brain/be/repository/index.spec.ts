import { describe, expect, it } from 'vitest'
import { repository } from '#generated/repository.ts'
import { query, create, EARS } from '#generated/ears.ts'

describe('brainCommands writing to a TNode', () => {
  it('leave nothing behind for a TNode that is gone', () => {
    const id = create(EARS.Entity.TNode).set('status', 'active').id()
    repository.brainCommands.clearVolatileData()

    repository.brainCommands.updateTNodeStatus(id, 'completed')
    repository.brainCommands.updateTNodeAttributes(id, { payload: 1 })

    expect(query.ids(id).exists()).toBe(false)
  })

  it('still write to a TNode that exists', () => {
    const id = create(EARS.Entity.TNode).set('status', 'active').id()

    repository.brainCommands.updateTNodeStatus(id, 'completed')
    repository.brainCommands.updateTNodeAttributes(id, { payload: 1 })

    expect(query.ids(id).pickOne(['status', 'nodeAttributes'])).toMatchObject({ status: 'completed', nodeAttributes: { payload: 1 } })
  })
})
