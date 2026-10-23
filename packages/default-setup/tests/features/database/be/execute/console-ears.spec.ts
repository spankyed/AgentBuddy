// The Database console reads the whole database, so `EARS.Entity` names every registered pack's entity types, not
// only default-setup's; `apack db query`/`exec` name the installed packs' the same way
import { afterEach, describe, expect, it } from 'vitest'
import { registerPack, unregisterPack } from '@apackdev/testing/harness'
import { executeQuery } from '#features/database/be/execute/query.ts'
import { executeTransaction } from '#features/database/be/execute/transaction.ts'

const MEMO_PACK = { id: 'memo-pack', ears: { entities: { Memo: 'Memo' }, relKinds: { MENTIONS: 'mentions' }, roles: {} } }

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
    await expect(executeQuery('return EARS.RelKind.MENTIONS')).resolves.toBe('mentions')
    await expect(executeTransaction('return EARS.Entity.Memo')).resolves.toBe('Memo')
  })

  // A gone pack's type is refused where it is named, so a query for it fails naming the type rather than
  // reaching `query` as `undefined`
  it("refuses a pack's types once it is unregistered", async () => {
    registerPack(MEMO_PACK)
    unregisterPack(MEMO_PACK.id)

    await expect(executeQuery('return EARS.Entity.Memo'))
      .rejects.toThrow('"Memo" is not an entity type this database can account for')
    await expect(executeQuery('return query(EARS.Entity.Memo).ids()'))
      .rejects.toThrow('"Memo" is not an entity type this database can account for')
    await expect(executeQuery('return EARS.Entity.Note')).resolves.toBe('Note')
  })
})
