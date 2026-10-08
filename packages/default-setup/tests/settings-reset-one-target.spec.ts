/**
 * Resetting settings has a target: one feature's, or one section's, rather than all of them.
 *
 * **It is a removal, not a write.** The row holds only what the user changed and the store composes the
 * registration's defaults underneath it, so forgetting a slice is the whole of a reset — which is why this
 * needed no new capability: `services.settings.removeStored` has always been the narrow door, reached until
 * now only by migrations. What the event gained is an address.
 *
 * This is also what replaced a user-facing reset that was reachable only by importing a pack's "seeds": the
 * `settings` entry in `boot.seed` whose seeder ignored its own record and called `reset()`, kept out of boot
 * by `boot.seedPolicy.skipAtBoot`. A destructive action belongs in the Settings view with a confirmation,
 * not in an import dialog.
 */
import { describe, expect, it } from 'vitest'
import { startApp } from '@abuddy/testing/harness'
import { services } from '#generated/services.ts'
import { ref } from '#generated/ref.ts'

const SETTINGS = 'host/settings'
const WINDOW = 'c-window'

const sortOf = (feature: 'threads' | 'notes') =>
  services.settings.forFeature<{ sort?: string }>(ref(feature))?.sort

describe('a reset naming one feature', () => {
  it('forgets that feature\'s changes and leaves every other feature\'s alone', async () => {
    const app = await startApp({ systems: [SETTINGS] })
    await app.connect()
    services.settings.setForFeature(ref('threads'), ['sort'], 'oldest')
    services.settings.setForFeature(ref('notes'), ['sort'], 'oldest')
    const defaults = { threads: sortOf('threads'), notes: sortOf('notes') }
    expect(defaults.threads, 'the change the case rests on was not stored').toBe('oldest')

    const call = await app.send(SETTINGS, {
      type: 'RESET_SETTINGS', target: { entityType: 'plugin', label: ref('threads') },
    }, { sender: SETTINGS, client: WINDOW })
    const answer = await app.nextEmit(SETTINGS, 'SETTINGS_SAVED', { answering: call })

    expect(answer).toMatchObject({ type: 'SETTINGS_SAVED' })
    expect(sortOf('threads'), 'its default applies again').not.toBe('oldest')
    expect(sortOf('notes'), 'another feature was reset too').toBe('oldest')
  })

  /** With no target it is the reset it always was: every change the user made, whatever it was about */
  it('forgets all of them when it names none', async () => {
    const app = await startApp({ systems: [SETTINGS] })
    await app.connect()
    services.settings.setForFeature(ref('threads'), ['sort'], 'oldest')
    services.settings.setForFeature(ref('notes'), ['sort'], 'oldest')

    const call = await app.send(SETTINGS, { type: 'RESET_SETTINGS' }, { sender: SETTINGS, client: WINDOW })
    await app.nextEmit(SETTINGS, 'SETTINGS_SAVED', { answering: call })

    expect(services.settings.getStored()).toEqual({})
  })
})

describe('a reset naming one section', () => {
  it('forgets that section and leaves the features alone', async () => {
    const app = await startApp({ systems: [SETTINGS] })
    await app.connect()
    services.settings.setInSection('general', ['application', 'theme'], 'dark')
    services.settings.setForFeature(ref('threads'), ['sort'], 'oldest')

    const call = await app.send(SETTINGS, {
      type: 'RESET_SETTINGS', target: { entityType: 'section', label: 'general' },
    }, { sender: SETTINGS, client: WINDOW })
    await app.nextEmit(SETTINGS, 'SETTINGS_SAVED', { answering: call })

    const stored = services.settings.getStored<{ general?: unknown }>()
    expect(stored.general, 'the section the reset named').toBeUndefined()
    expect(sortOf('threads'), 'a feature was reset with the section').toBe('oldest')
  })
})
