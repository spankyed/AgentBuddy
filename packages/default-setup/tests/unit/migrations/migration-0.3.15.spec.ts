// 0.3.15 moves the boot seed's record under the pack that ran it, and marks rows seeded before the seeder
// recorded what it wrote as unedited — without that every row an older version seeded stays frozen. Action
// logs moved from `log-service` to `action:<label>`, so whoever hid `log-service` gets `action:*` hidden too.
import { describe, expect, it } from 'vitest'
import { tx, untypedQx } from '@abuddy/sdk/ears'
import { dropAttribute } from '@abuddy/sdk/testing'
import { migrations } from '../../../src/migrations/index'
import { repository } from '@/__generated__/repository'
import { createDefaultSettings } from '@/features/settings/be/repository'
import { EARS, createEntityWithDefaults } from '@/__generated__/ears'

/** The migration as the pack registers it, so this fails too if it was never listed */
const migration = migrations.find((m) => m.target === '0.3.15')!

const internal = () => repository.settingsQueries.getInternalSettings() as Record<string, any>
const setInternal = (key: string, value: unknown) => repository.settingsCommands.updateSettings('internal', null, [key], value)

/** A row as an older version's seeder left it: a source hash, but no record of the values it wrote */
function seededTheOldWay(name: string) {
  const row = createEntityWithDefaults(EARS.Entity.Note, { label: name, title: name, content: 'seeded', sourceHash: `${name}-v1` })
  dropAttribute(row.id, 'seededFields')
  return row.id
}

const attrs = (id: string) => (untypedQx(id as never).pickAll() as Array<Record<string, unknown>>)[0]

describe('the 0.3.15 migration', () => {
  it("files the boot seed's record under the pack that ran it", () => {
    createDefaultSettings()
    setInternal('seedHash', 'abc123')
    setInternal('seedStatFingerprint', 'file:1:2')

    migration.up()

    expect(internal().seedHashes).toEqual({ 'default-setup': 'abc123' })
    expect(internal().seedStatFingerprints).toEqual({ 'default-setup': 'file:1:2' })
  })

  it('leaves a record it already moved alone, so it can run again after a reset', () => {
    createDefaultSettings()
    setInternal('seedHash', 'abc123')
    setInternal('seedHashes', { 'default-setup': 'newer', 'other-pack': 'theirs' })

    migration.up()

    expect(internal().seedHashes).toEqual({ 'default-setup': 'newer', 'other-pack': 'theirs' })
  })

  it('marks a row seeded before the seeder tracked its values as unedited', () => {
    createDefaultSettings()
    const id = seededTheOldWay('Welcome')

    migration.up()

    // Empty field list: nothing was recorded to compare against, so the row reads as unedited
    expect(attrs(id).seededFields).toEqual({ fields: [], hash: expect.any(String) })
  })

  it("leaves a user's own row alone: it carries no source hash", () => {
    createDefaultSettings()
    const mine = createEntityWithDefaults(EARS.Entity.Note, { label: 'Mine', title: 'Mine', content: 'mine' })

    migration.up()

    expect(attrs(mine.id).seededFields).toBeUndefined()
  })

  it('leaves a row the current seeder already stamped alone', () => {
    createDefaultSettings()
    const row = createEntityWithDefaults(EARS.Entity.Note, { label: 'Tracked', title: 'Tracked', content: 'seeded', sourceHash: 'tracked-v1' })
    // seededFields is the seeder's own bookkeeping, not a declared Note field: written with the unchecked tx
    tx(row.id).update('seededFields', { fields: ['title'], hash: 'kept' })

    migration.up()

    expect(attrs(row.id).seededFields).toEqual({ fields: ['title'], hash: 'kept' })
  })

  const excludedSources = () => (repository.settingsQueries.getSettings().plugins as any).logs.excludedSources
  const setExcludedSources = (value: string[]) => repository.settingsCommands.updateSettings('plugin', 'logs', ['excludedSources'], value)

  it('hides action logs for a user who hid log-service', () => {
    createDefaultSettings()
    setExcludedSources(['brain', 'log-service'])

    migration.up()
    migration.up()

    expect(excludedSources()).toEqual(['brain', 'log-service', 'action:*'])
  })

  it("leaves the logs exclusions alone when log-service isn't hidden", () => {
    createDefaultSettings()
    setExcludedSources(['brain'])

    migration.up()

    expect(excludedSources()).toEqual(['brain'])
  })
})
