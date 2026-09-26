// 0.3.15 drops the app's state from the settings (the host moved it to AppState first), and marks rows seeded before
// the seeder recorded what it wrote as unedited — without that every row an older version seeded stays frozen. Action
// logs moved from `log-service` to `action:<label>`, so whoever hid `log-service` gets `action:*` hidden too. The
// settings' copies of the root flow and of the flow the brain runs are dropped: the role and the brain own them. Link
// blocks, which named this pack's plugins by bare id, name their refs, and a link to a plugin since removed is dropped. And 0.3.14 stored every default as if the user had chosen it:
// what still equals 0.3.14's default is dropped, so today's defaults apply.
import { services } from '@/__generated__/services';
import { afterEach, describe, expect, it, vi } from 'vitest'
import { untypedTx, untypedQx } from '@abuddy/ears'
import type { EARS as SdkEARS } from '@abuddy/sdk'
import { dropAttribute } from '@abuddy/sdk/testing'
import { migrations } from '../../src/migrations/index'
import { EARS, createEntityWithDefaults } from '@/__generated__/ears'
import { ref } from '@/__generated__/ref'
import { addressLinkBlocks } from '../../src/migrations/bare-feature-ids'
import { DEFAULT_SETTINGS_0314 } from '../../src/migrations/defaults-0.3.14'

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
    // As 0.3.14 stored it
    untypedTx('Settings-app' as SdkEARS.EntityId).update('data', {
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
    // As 0.3.14 stored them, once the host's 0.3.15 migration moved them onto the plugins' refs
    untypedTx('Settings-app' as SdkEARS.EntityId).update('data', {
      plugins: {
        'default-setup/flows': { rootFlowId: 'Flow-1', enableFlowPreview: false },
        'default-setup/brain': { runningRootFlowId: 'Flow-1', inspectEnabled: true },
      },
    })

    migration.up()
    expect(stored()).toEqual({ plugins: { 'default-setup/flows': { enableFlowPreview: false }, 'default-setup/brain': { inspectEnabled: true } } })

    migration.up()
    expect(stored()).toEqual({ plugins: { 'default-setup/flows': { enableFlowPreview: false }, 'default-setup/brain': { inspectEnabled: true } } })
  })

  it('marks a row seeded before the seeder tracked its values as unedited', () => {
    const id = seededTheOldWay('Welcome')

    migration.up()

    // Empty field list: nothing was recorded to compare against, so the row reads as unedited
    expect(attrs(id).seededFields).toEqual({ fields: [], hash: expect.any(String) })
  })

  it("leaves a user's own row alone: it carries no source hash", () => {
    const mine = createEntityWithDefaults(EARS.Entity.Note, { label: 'Mine', title: 'Mine', content: 'mine' })

    migration.up()

    expect(attrs(mine.id).seededFields).toBeUndefined()
  })

  it('leaves a row the current seeder already stamped alone', () => {
    const row = createEntityWithDefaults(EARS.Entity.Note, { label: 'Tracked', title: 'Tracked', content: 'seeded', sourceHash: 'tracked-v1' })
    // seededFields is the seeder's own bookkeeping, not a declared Note field: written with the unchecked untypedTx
    untypedTx(row.id).update('seededFields', { fields: ['title'], hash: 'kept' })

    migration.up()

    expect(attrs(row.id).seededFields).toEqual({ fields: ['title'], hash: 'kept' })
  })

  const excludedSources = () => (services.settings.forFeature(ref('logs')) as any).excludedSources
  const setExcludedSources = (value: string[]) => services.settings.setForFeature(ref('logs'), ['excludedSources'], value)

  it('hides action logs for a user who hid log-service', () => {
    setExcludedSources(['brain', 'log-service'])

    migration.up()
    migration.up()

    expect(excludedSources()).toEqual(['brain', 'log-service', 'action:*'])
  })

  it("leaves the logs exclusions alone when log-service isn't hidden", () => {
    setExcludedSources(['brain'])

    migration.up()

    expect(excludedSources()).toEqual(['brain'])
  })

  // 0.3.14 stored the whole default settings with the user's changes merged in
  describe("0.3.14's stored copies of its defaults", () => {
    afterEach(() => vi.restoreAllMocks())

    /**
     * A row as 0.3.14 left it, once the host's 0.3.15 migration moved the plugin slices onto their refs: every default,
     * the user's changes merged in
     */
    function rowOf0314(changes: (row: any) => void) {
      const row = structuredClone(DEFAULT_SETTINGS_0314) as any
      row.plugins = Object.fromEntries(Object.entries(row.plugins).map(([id, slice]) => [`default-setup/${id}`, slice]))
      row.internal = { hasOnboarded: true, version: '0.3.14', seedHash: 'abc123', lastInteractionTimestamp: null }
      changes(row)
      untypedTx('Settings-app' as SdkEARS.EntityId).update('data', row)
    }

    const USER_CHANGES = {
      general: {
        personal: { name: 'Ada' },
        // Each value is compared on its own: a hotkey keeps the part the user changed
        application: { hotkeys: { toggleInspectionPanel: { key: 'i' } } },
      },
      assistant: { name: 'Buddy' },
      plugins: {
        // A value changed deep inside a default object, the rest of which goes
        'default-setup/code': { hotkeys: { saveFile: { modifiers: ['ctrl'] } }, maxTerminals: 40 },
        // An array the user changed is kept whole
        'default-setup/threads': {
          recentThreadsLimit: 12,
          tags: [...(DEFAULT_SETTINGS_0314.plugins.threads as { tags: unknown[] }).tags, { name: 'Mine', color: '#000000' }],
        },
        'default-setup/logs': { excludedSources: ['brain'] },
        // Another pack's slice: 0.3.14 stored no defaults for it
        'memo-pack/memos': { enabled: true, tags: [] },
      },
    }

    function withUserChanges(row: any) {
      row.general.personal = { name: 'Ada' }
      row.general.application.hotkeys.toggleInspectionPanel = { key: 'i', modifiers: ['cmd'] }
      row.assistant.name = 'Buddy'
      row.plugins['default-setup/code'].hotkeys.saveFile = { key: 's', modifiers: ['ctrl'] }
      row.plugins['default-setup/code'].maxTerminals = 40
      row.plugins['default-setup/threads'].recentThreadsLimit = 12
      row.plugins['default-setup/threads'].tags.push({ name: 'Mine', color: '#000000' })
      row.plugins['default-setup/logs'].excludedSources = ['brain']
      row.plugins['memo-pack/memos'] = { enabled: true, tags: [] }
    }

    it("keeps only the user's changes, and a second run changes nothing", () => {
      rowOf0314(withUserChanges)

      migration.up()
      expect(stored()).toEqual(USER_CHANGES)

      const replace = vi.spyOn(services.settings, 'replaceAll')
      migration.up()
      expect(stored()).toEqual(USER_CHANGES)
      // Not even a write of the same settings, which would tell every feature its settings changed
      expect(replace).not.toHaveBeenCalled()
    })

    // A thrown migration would stop every later migration and the seeds on every boot
    it('leaves the row as it was when the settings refuse the pruned copy', () => {
      rowOf0314(withUserChanges)
      vi.spyOn(services.settings, 'replaceAll').mockImplementation(() => {
        throw new Error('refused')
      })

      expect(() => migration.up()).not.toThrow()
      expect((stored().plugins as Record<string, any>)['default-setup/threads'].recentThreadsLimit).toBe(12)
      expect((stored().plugins as Record<string, any>)['default-setup/threads'].clickToChat).toBe(true)
    })

    it('drops a row that changed nothing down to nothing, so every default applies', () => {
      rowOf0314(() => {})
      // What the migration itself keeps, before the settings drop what equals today's defaults too: nothing, not even
      // a 0.3.14 default copied to the key it moved to
      const replace = vi.spyOn(services.settings, 'replaceAll')

      migration.up()

      expect(replace).toHaveBeenLastCalledWith({})
      expect(stored()).toEqual({})
    })

    it('takes an object with its keys in another order as the default, and an array in another order as a change', () => {
      rowOf0314((row) => {
        // A settings editor may write an object back with its keys in another order: still 0.3.14's default, inside an
        // array too, which is compared whole
        row.plugins['default-setup/code'].hotkeys.quickOpen = { modifiers: ['cmd'], key: 'p' }
        row.plugins['default-setup/threads'].statuses = row.plugins['default-setup/threads'].statuses
          .map(({ label, color }: { label: string; color: string }) => ({ color, label }))
        row.plugins['default-setup/code'].hotkeys.openTerminalTab = { key: '`', modifiers: ['shift', 'ctrl'] }
      })

      // What the migration itself keeps, before the settings drop what equals today's defaults too
      const replace = vi.spyOn(services.settings, 'replaceAll')
      migration.up()

      const kept = { plugins: { 'default-setup/code': { hotkeys: { openTerminalTab: { modifiers: ['shift', 'ctrl'] } } } } }
      expect(replace).toHaveBeenLastCalledWith(kept)
      expect(stored()).toEqual(kept)
    })
  })

  // 0.3.14 copied both settings to their new keys but left the old ones stored
  describe('the keys 0.3.14 moved but left behind', () => {
    it("drops the code plugin's lastDirectoryOpened, keeping the baseDirectory the user has", () => {
      untypedTx('Settings-app' as SdkEARS.EntityId).update('data', {
        plugins: { 'default-setup/code': { lastDirectoryOpened: '/old', baseDirectory: '/chosen' } },
      })

      migration.up()
      migration.up()

      expect((stored().plugins as Record<string, any>)['default-setup/code']).toEqual({ baseDirectory: '/chosen' })
    })

    it('copies lastDirectoryOpened to baseDirectory when the user has none stored', () => {
      untypedTx('Settings-app' as SdkEARS.EntityId).update('data', { plugins: { 'default-setup/code': { lastDirectoryOpened: '/work' } } })

      migration.up()

      expect((stored().plugins as Record<string, any>)['default-setup/code']).toEqual({ baseDirectory: '/work' })
    })

    it("moves openLinksInApp to the browser plugin's settings unless the user set it there", () => {
      untypedTx('Settings-app' as SdkEARS.EntityId).update('data', { general: { application: { openLinksInApp: false } } })

      migration.up()
      migration.up()

      expect(stored()).toEqual({ plugins: { 'default-setup/browser': { openLinksInApp: false } } })

      untypedTx('Settings-app' as SdkEARS.EntityId).update('data', {
        general: { application: { openLinksInApp: false } },
        plugins: { 'default-setup/browser': { openLinksInApp: true } },
      })

      migration.up()

      // The user's `true` is today's default, so the settings keep it as the default rather than storing it
      expect((services.settings.forFeature(ref('browser')) as any).openLinksInApp).toBe(true)
      expect(stored()).toEqual({})
    })
  })

  // `services.chat.sendLinkBlock` stored links naming the plugin they open by its bare id, which this pack's ran under
  describe('link blocks', () => {
    const link = (target: string, data: Record<string, unknown> = { type: 'OPEN' }) => ({ label: target, event: { target, data } })

    it("points a bare target this pack's plugin had at its ref, and leaves external links, refs and other packs' ids", () => {
      const message = createEntityWithDefaults(EARS.Entity.Message, { text: 'see' } as never)
      const blocks = [
        { type: 'link', props: { links: [link('settings'), link('external', { url: 'https://x.dev' }), link('memo-pack/memos'), link('memos')] } },
        { type: 'text', props: { text: 'unchanged' } },
      ]
      untypedTx(message.id as never).put('blocks', blocks as never)

      migration.up()
      const moved = attrs(message.id).blocks as typeof blocks
      expect(moved[0].props.links!.map((l) => l.event.target)).toEqual(['host/settings', 'external', 'memo-pack/memos', 'memos'])
      expect(moved[0].props.links![0].event.data).toEqual({ type: 'OPEN' })
      expect(moved[1]).toEqual(blocks[1])

      // Running again changes nothing
      migration.up()
      expect(attrs(message.id).blocks).toEqual(moved)
    })

    // A link can't send the app shell an event any more: opening an `application` target would throw
    it('opens the plugin an application link selected, drops the other application links, and a link block left empty', () => {
      const message = createEntityWithDefaults(EARS.Entity.Message, { text: 'see' } as never)
      untypedTx(message.id as never).put('blocks', [
        { type: 'link', props: { links: [link('application', { type: 'SELECT_PLUGIN', pluginId: 'notes' }), link('application', { type: 'SHOW_INSPECTION_PANEL' })] } },
        { type: 'link', props: { links: [link('application', { type: 'SHOW_INSPECTION_PANEL' })] } },
        { type: 'link', props: { links: [link('application', { type: 'SELECT_PLUGIN', pluginId: 'memos' })] } },
      ] as never)

      migration.up()
      migration.up()

      expect(attrs(message.id).blocks).toEqual([
        { type: 'link', props: { links: [{ label: 'application', event: { target: 'default-setup/notes', data: undefined } }] } },
      ])
    })

    // 0.3.14's calendar plugin is gone: opening a link to it would throw
    it('drops a link to a plugin removed since 0.3.14, and a link block left empty', () => {
      const message = createEntityWithDefaults(EARS.Entity.Message, { text: 'see' } as never)
      untypedTx(message.id as never).put('blocks', [
        { type: 'link', props: { links: [link('calendar'), link('notes')] } },
        { type: 'link', props: { links: [link('calendar', { type: 'SELECT_EVENT', id: 'e1' })] } },
      ] as never)

      migration.up()
      migration.up()

      expect(attrs(message.id).blocks).toEqual([
        { type: 'link', props: { links: [{ label: 'notes', event: { target: 'default-setup/notes', data: { type: 'OPEN' } } }] } },
      ])
    })

    it('leaves blocks with nothing to address as they were', () => {
      const blocks = [{ type: 'link', props: { links: [link('default-setup/notes'), link('external')] } }, { type: 'text' }]
      expect(addressLinkBlocks(blocks)).toBe(blocks)
      expect(addressLinkBlocks(undefined)).toBeUndefined()
    })
  })
})
