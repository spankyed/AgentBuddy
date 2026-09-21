// 0.3.15 drops the app's state from the settings (the host moved it to AppState first), and marks rows seeded before
// the seeder recorded what it wrote as unedited — without that every row an older version seeded stays frozen. Action
// logs moved from `log-service` to `action:<label>`, so whoever hid `log-service` gets `action:*` hidden too. The
// settings' copies of the root flow and of the flow the brain runs are dropped: the role and the brain own them.
import { describe, expect, it } from 'vitest'
import { tx, untypedQx } from '@abuddy/ears'
import type { EARS as SdkEARS } from '@abuddy/sdk'
import { dropAttribute } from '@abuddy/sdk/testing'
import { migrations } from '../../../src/migrations/index'
import { repository } from '@/__generated__/repository'
import { createDefaultSettings } from '@/features/settings/be/repository'
import { EARS, createEntityWithDefaults } from '@/__generated__/ears'

/** The migration as the pack registers it, so this fails too if it was never listed */
const migration = migrations.find((m) => m.target === '0.3.15')!

/** The settings row as the repository stores it: only what differs from the defaults */
const stored = () => untypedQx('Settings-app' as SdkEARS.EntityId).pickOne(['data'])?.data as Record<string, unknown>

/** A row as an older version's seeder left it: a source hash, but no record of the values it wrote */
function seededTheOldWay(name: string) {
  const row = createEntityWithDefaults(EARS.Entity.Note, { label: name, title: name, content: 'seeded', sourceHash: `${name}-v1` })
  dropAttribute(row.id, 'seededFields')
  return row.id
}

const attrs = (id: string) => (untypedQx(id as never).pickAll() as Array<Record<string, unknown>>)[0]

describe('the 0.3.15 migration', () => {
  it("drops the app's state from the stored settings, and keeps the user's", () => {
    createDefaultSettings()
    // As 0.3.14 stored it
    tx('Settings-app' as SdkEARS.EntityId).update('data', {
      general: { application: { openLinksInApp: false } },
      internal: { hasOnboarded: true, version: '0.3.14', seedHash: 'abc123' },
    })

    migration.up()
    expect(stored()).toEqual({ general: { application: { openLinksInApp: false } } })

    // Running again changes nothing
    migration.up()
    expect(stored()).toEqual({ general: { application: { openLinksInApp: false } } })
  })

  it("drops the settings' root flow copies, keeping the plugins' other settings", () => {
    createDefaultSettings()
    // As 0.3.14 stored them
    tx('Settings-app' as SdkEARS.EntityId).update('data', {
      plugins: {
        flows: { rootFlowId: 'Flow-1', enableFlowPreview: false },
        brain: { runningRootFlowId: 'Flow-1', inspectEnabled: true },
      },
    })

    migration.up()
    expect(stored()).toEqual({ plugins: { 'default-setup.flows': { enableFlowPreview: false }, 'default-setup.brain': { inspectEnabled: true } } })

    migration.up()
    expect(stored()).toEqual({ plugins: { 'default-setup.flows': { enableFlowPreview: false }, 'default-setup.brain': { inspectEnabled: true } } })
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

  const excludedSources = () => (repository.settingsQueries.getPluginSettings('logs') as any).excludedSources
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

  // A plugin is addressed `<packId>.<featureId>` now. Without this move, the app reads
  // `plugins['default-setup.threads']` while the user's settings say `plugins.threads`: their pinned
  // plugins come back at the defaults and the app opens on whatever the default plugin is.
  describe('moving the plugin settings onto namespaced plugin ids', () => {
    /** The stored settings as 0.3.14 wrote them, for a user who hid two plugins and left on Notes */
    const storeBareSettings = () => {
      createDefaultSettings()
      tx('Settings-app' as SdkEARS.EntityId).update('data', {
        plugins: {
          notes: { sortBy: 'created' },
          logs: { excludedSources: ['brain'] },
          _meta: { visibility: { browser: false, database: false }, lastActivePlugin: 'notes' },
        },
      })
    }

    it("moves the user's plugin settings, visibility and last-active plugin", () => {
      storeBareSettings()

      migration.up()

      const plugins = stored().plugins as Record<string, any>
      expect(plugins['default-setup.notes']).toEqual({ sortBy: 'created' })
      expect(plugins).not.toHaveProperty('notes')
      expect(plugins._meta.visibility).toEqual({ 'default-setup.browser': false, 'default-setup.database': false })
      expect(plugins._meta.lastActivePlugin).toBe('default-setup.notes')
    })

    // It runs again on every development boot and after a reset
    it('is idempotent: a second run moves nothing and changes nothing', () => {
      storeBareSettings()

      migration.up()
      const afterFirst = structuredClone(stored())
      migration.up()

      expect(stored()).toEqual(afterFirst)
    })

    it("leaves a key the user already has under the namespaced id, and drops the stale one", () => {
      createDefaultSettings()
      tx('Settings-app' as SdkEARS.EntityId).update('data', {
        plugins: { notes: { sortBy: 'stale' }, 'default-setup.notes': { sortBy: 'current' } },
      })

      migration.up()

      const plugins = stored().plugins as Record<string, any>
      expect(plugins['default-setup.notes']).toEqual({ sortBy: 'current' })
      expect(plugins).toHaveProperty('notes')
    })

    it('does nothing for a user who changed no plugin settings', () => {
      createDefaultSettings()
      tx('Settings-app' as SdkEARS.EntityId).update('data', { general: { application: { openLinksInApp: false } } })

      migration.up()

      expect(stored()).not.toHaveProperty('plugins')
    })
  })
})
