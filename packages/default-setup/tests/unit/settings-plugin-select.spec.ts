// The settings plugin shows the settings of the plugin PLUGIN.SELECT names. Any pack can send it (with
// navigateToPlugin), so it takes a plugin's ref: a bare name would be read as this pack's plugin. A bad one is reported
// and ignored, rather than stopping the settings plugin.
import { afterAll, afterEach, expect, it, vi } from 'vitest'
import { createActor } from 'xstate'
import { startFeTestRuntime } from '@abuddy/sdk/testing'
import settingsState from '@/features/settings/fe/state'

afterAll(startFeTestRuntime({ transport: { sendIncoming() {} } }))
afterEach(() => vi.restoreAllMocks())

function readySettingsPlugin() {
  const actor = createActor(settingsState).start()
  actor.send({ type: 'SETTINGS_LOADED', data: { general: {}, plugins: {}, assistant: {} } as never, faqs: [] })
  return actor
}

it('selects the plugin a ref names', () => {
  const actor = readySettingsPlugin()
  actor.send({ type: 'PLUGIN.SELECT', pluginId: 'e2e-fixture/memos' })
  expect(actor.getSnapshot().context.selectedPluginId).toBe('e2e-fixture/memos')
})

it('ignores and reports a bare name, keeping what was selected and running on', () => {
  const reported = vi.spyOn(console, 'error').mockImplementation(() => {})
  const actor = readySettingsPlugin()
  actor.send({ type: 'PLUGIN.SELECT', pluginId: 'default-setup/logs' })

  actor.send({ type: 'PLUGIN.SELECT', pluginId: 'memos' as never })

  expect(actor.getSnapshot().context.selectedPluginId).toBe('default-setup/logs')
  expect(actor.getSnapshot().status).toBe('active')
  expect(reported).toHaveBeenCalledWith(expect.stringContaining(`"memos", which isn't a plugin's ref`))
})
