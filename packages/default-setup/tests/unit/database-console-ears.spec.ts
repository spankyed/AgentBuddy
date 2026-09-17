// The Database console reads the whole database, so `EARS.Entity` names every registered pack's entity types, not
// only default-setup's; `abuddy db query`/`exec` name the installed packs' the same way
import { afterEach, describe, expect, it } from 'vitest'
import { registerPack, unregisterPack } from '@abuddy/testing/harness'
import { executeQuery } from '@/features/database/be/execute/query'
import { executeTransaction } from '@/features/database/be/execute/transaction'

const MEMO_PACK = { id: 'memo-pack', systems: [], ears: { entities: { Memo: 'Memo' }, relKinds: { mentions: 'mentions' } } }

afterEach(() => {
  try { unregisterPack(MEMO_PACK.id) } catch { /* the test didn't register it */ }
})

describe("the console's EARS", () => {
  it("names default-setup's own entity types and relation kinds", async () => {
    await expect(executeQuery('return EARS.Entity.Note')).resolves.toBe('Note')
    await expect(executeQuery('return EARS.RelKind.CONTAINS')).resolves.toBe('contains')
  })

  it("names another registered pack's, in a query and in a transaction", async () => {
    registerPack(MEMO_PACK)

    await expect(executeQuery('return EARS.Entity.Memo')).resolves.toBe('Memo')
    await expect(executeQuery('return EARS.RelKind.mentions')).resolves.toBe('mentions')
    await expect(executeTransaction('return EARS.Entity.Memo')).resolves.toBe('Memo')
  })

  it("stops naming a pack's types once it is unregistered", async () => {
    registerPack(MEMO_PACK)
    unregisterPack(MEMO_PACK.id)

    await expect(executeQuery('return EARS.Entity.Memo')).resolves.toBeUndefined()
  })
})
