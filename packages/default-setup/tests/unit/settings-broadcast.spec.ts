// Whatever changes the settings, the settings plugin and the app shell both follow: the shell reads its hotkeys
// from them, so a reset that left it with the old ones would keep keys the user no longer has
import { expect, it } from 'vitest'
import { startApp } from '@abuddy/testing/harness'

it('sends the app shell its hotkeys when the settings are reset, as it does on every change', async () => {
  const app = await startApp({ systems: ['host/settings'] })
  await app.connect()
  const before = app.emitted('host/application').filter((e) => e.type === 'APPLICATION_HOTKEYS').length

  await app.send('host/settings', { type: 'RESET_SETTINGS' })
  await app.settle()

  expect(app.emitted('host/settings').map((e) => e.type)).toContain('SETTINGS_RESET')
  expect(app.emitted('host/application').filter((e) => e.type === 'APPLICATION_HOTKEYS')).toHaveLength(before + 1)
})
