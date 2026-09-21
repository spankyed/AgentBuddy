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
import { pluginSettingsKey } from '@/features/settings/plugin-settings'

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
      general: { personal: { name: 'Ada' } },
      internal: { hasOnboarded: true, version: '0.3.14', seedHash: 'abc123' },
    })

    migration.up()
    expect(stored()).toEqual({ general: { personal: { name: 'Ada' } } })

    // Running again changes nothing
    migration.up()
    expect(stored()).toEqual({ general: { personal: { name: 'Ada' } } })
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
    expect(stored()).toEqual({ plugins: { 'default-setup/flows': { enableFlowPreview: false }, 'default-setup/brain': { inspectEnabled: true } } })

    migration.up()
    expect(stored()).toEqual({ plugins: { 'default-setup/flows': { enableFlowPreview: false }, 'default-setup/brain': { inspectEnabled: true } } })
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

  const excludedSources = () => (repository.settingsQueries.getPluginSettings(pluginSettingsKey('logs')) as any).excludedSources
  const setExcludedSources = (value: string[]) => repository.settingsCommands.updateSettings('plugin', pluginSettingsKey('logs'), ['excludedSources'], value)

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

  // A plugin runs under `<packId>/<featureId>` now. Without this move, the app reads
  // `plugins['default-setup/threads']` while the user's settings say `plugins.threads`, and their settings come
  // back at the defaults. The sidebar's state (`_meta`) is the host's, moved by its own 0.3.15 migration.
  describe("moving the plugin settings onto their plugins' refs", () => {
    /** The stored plugin settings as 0.3.14 wrote them */
    const storeBareSettings = () => {
      createDefaultSettings()
      tx('Settings-app' as SdkEARS.EntityId).update('data', {
        plugins: {
          notes: { sortBy: 'created' },
          logs: { excludedSources: ['brain'] },
        },
      })
    }

    it("moves the user's plugin settings", () => {
      storeBareSettings()

      migration.up()

      const plugins = stored().plugins as Record<string, any>
      expect(plugins['default-setup/notes']).toEqual({ sortBy: 'created' })
      expect(plugins).not.toHaveProperty('notes')
      expect(plugins).not.toHaveProperty('logs')
    })

    // It runs again on every development boot and after a reset
    it('is idempotent: a second run moves nothing and changes nothing', () => {
      storeBareSettings()

      migration.up()
      const afterFirst = structuredClone(stored())
      migration.up()

      expect(stored()).toEqual(afterFirst)
    })

    // Upgrading from 0.3.13, 0.3.14 runs first and writes `baseDirectory` to the address, while the rest of the
    // user's code settings are still under `code`: both have to survive the move
    it('keeps the rest of a slice an older migration already wrote to the address', () => {
      createDefaultSettings()
      tx('Settings-app' as SdkEARS.EntityId).update('data', {
        plugins: { code: { lastDirectoryOpened: '/work', cliPaths: { gh: '/opt/bin/gh' } } },
      })

      migrations.find((m) => m.target === '0.3.14')!.up()
      migration.up()

      const plugins = stored().plugins as Record<string, any>
      expect(plugins['default-setup/code']).toEqual({ baseDirectory: '/work', cliPaths: { gh: '/opt/bin/gh' } })
      expect(plugins).not.toHaveProperty('code')
    })

    it("keeps what the user has under the ref over the bare key, and drops the bare one", () => {
      createDefaultSettings()
      tx('Settings-app' as SdkEARS.EntityId).update('data', {
        plugins: { notes: { sortBy: 'stale' }, 'default-setup/notes': { sortBy: 'current' } },
      })

      migration.up()

      const plugins = stored().plugins as Record<string, any>
      expect(plugins['default-setup/notes']).toEqual({ sortBy: 'current' })
      expect(plugins).not.toHaveProperty('notes')
    })

    it('does nothing for a user who changed no plugin settings', () => {
      createDefaultSettings()
      tx('Settings-app' as SdkEARS.EntityId).update('data', { general: { personal: { name: 'Ada' } } })

      migration.up()

      expect(stored()).not.toHaveProperty('plugins')
    })
  })

  // 0.3.14 copied both settings to their new keys but left the old ones stored
  describe('the keys 0.3.14 moved but left behind', () => {
    it("drops the code plugin's lastDirectoryOpened, keeping the baseDirectory the user has", () => {
      createDefaultSettings()
      tx('Settings-app' as SdkEARS.EntityId).update('data', {
        plugins: { code: { lastDirectoryOpened: '/old', baseDirectory: '/chosen' } },
      })

      migration.up()
      migration.up()

      expect((stored().plugins as Record<string, any>)['default-setup/code']).toEqual({ baseDirectory: '/chosen' })
    })

    it('copies lastDirectoryOpened to baseDirectory when the user has none stored', () => {
      createDefaultSettings()
      tx('Settings-app' as SdkEARS.EntityId).update('data', { plugins: { code: { lastDirectoryOpened: '/work' } } })

      migration.up()

      expect((stored().plugins as Record<string, any>)['default-setup/code']).toEqual({ baseDirectory: '/work' })
    })

    it("moves openLinksInApp to the browser plugin's settings unless the user set it there", () => {
      createDefaultSettings()
      tx('Settings-app' as SdkEARS.EntityId).update('data', { general: { application: { openLinksInApp: false } } })

      migration.up()
      migration.up()

      expect(stored()).toEqual({ general: { application: {} }, plugins: { 'default-setup/browser': { openLinksInApp: false } } })

      createDefaultSettings()
      tx('Settings-app' as SdkEARS.EntityId).update('data', {
        general: { application: { openLinksInApp: false } },
        plugins: { browser: { openLinksInApp: true } },
      })

      migration.up()

      expect((stored().plugins as Record<string, any>)['default-setup/browser']).toEqual({ openLinksInApp: true })
      expect((stored().general as any).application).not.toHaveProperty('openLinksInApp')
    })
  })
})
