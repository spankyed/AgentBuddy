// 0.3.0 adds the Codex mode to the chat modes a user stored and drops Hermes. It reads the stored settings, not the
// merged ones: the defaults already have Codex, and a user who never changed the modes must keep getting the defaults.
import { describe, expect, it } from 'vitest'
import { tx, untypedQx } from '@abuddy/ears'
import type { EARS as SdkEARS } from '@abuddy/sdk'
import { migrations } from '../../../src/migrations/index'
import { repository } from '@/__generated__/repository'
import { createDefaultSettings } from '@/features/settings/be/repository'
import { pluginSettingsKey } from '@/features/settings/plugin-settings'
import threadsSettings from '@/features/threads/settings'

/** The migration as the pack registers it, so this fails too if it was never listed */
const migration = migrations.find((m) => m.target === '0.3.0')!

/** The settings row as the repository stores it: only what differs from the defaults */
const stored = () => untypedQx('Settings-app' as SdkEARS.EntityId).pickOne(['data'])?.data as Record<string, unknown>
const storeAsBefore = (data: Record<string, unknown>) => tx('Settings-app' as SdkEARS.EntityId).update('data', data)
const modeIds = () => (repository.settingsQueries.getPluginSettings(pluginSettingsKey('threads')) as any).chat.modes.map((m: { id: string }) => m.id)

describe('the 0.3.0 migration', () => {
  it('leaves the default chat modes to a user who never changed them, and stores nothing', () => {
    createDefaultSettings()
    storeAsBefore({ general: { application: { openLinksInApp: false } } })

    migration.up()
    migration.up()

    expect(modeIds()).toEqual(threadsSettings.plugins.threads.chat.modes.map((m) => m.id))
    expect(stored()).toEqual({ general: { application: { openLinksInApp: false } } })
  })

  it("adds Codex to the modes a user stored, after Hermes, and drops Hermes and its settings", () => {
    createDefaultSettings()
    // As a pre-0.3.0 user stored them: under the feature id
    storeAsBefore({
      plugins: {
        threads: { chat: { modes: [{ id: 'claude-code', name: 'Claude Code' }, { id: 'hermes', name: 'Hermes' }, { id: 'manager', name: 'Manager' }] } },
        hermes: { url: 'http://localhost' },
      },
    })

    migration.up()
    migration.up()

    const modes = (stored().plugins as any)[pluginSettingsKey('threads')].chat.modes
    expect(modes.map((m: { id: string }) => m.id)).toEqual(['claude-code', 'codex', 'manager'])
    expect(modes[1].phases.map((p: { id: string }) => p.id)).toEqual(['plan', 'default'])
    expect(stored().plugins).not.toHaveProperty('hermes')
    // Only what the user had and what the migration changed: no default is written into the stored settings
    expect(Object.keys(stored().plugins as object).sort()).toEqual([pluginSettingsKey('threads'), 'threads'])
  })
})
