// The settings editor saves by replacing the settings (SETTINGS.REPLACE), and says "Saved" only when the store answers
// that it stored them: the plugin holds the last replacement's status, in flight, stored, or refused with the reasons
// the store gave, which the editor shows beside the text it keeps.
import { afterAll, beforeEach, expect, it, vi } from 'vitest'
import { createActor } from 'xstate'
import type { Message } from '@abuddy/sdk/events'
import { startFeTestRuntime } from '@abuddy/sdk/testing'
import settingsState from '@/features/settings/fe/state'

const sent = vi.fn<(message: Message) => void>()
afterAll(startFeTestRuntime({ client: { send: sent } }))
beforeEach(() => sent.mockClear())

function readySettingsPlugin() {
  const actor = createActor(settingsState).start()
  actor.send({ type: 'SETTINGS_LOADED', data: { general: {}, plugins: {}, assistant: {} } as never, faqs: [] })
  return actor
}

const replacement = (actor: ReturnType<typeof readySettingsPlugin>) => actor.getSnapshot().context.replacement

it('sends the replacement to the settings system, and is saving until the store answers', () => {
  const actor = readySettingsPlugin()
  const data = { general: {}, plugins: { 'default-setup/code': { maxTerminals: 3 } } }

  actor.send({ type: 'SETTINGS.REPLACE', data })

  expect(replacement(actor)).toEqual({ status: 'saving', problems: [] })
  expect(sent).toHaveBeenCalledWith({ to: 'default-setup/settings', event: { type: 'REPLACE_SETTINGS', data } })
})

it('is saved once the store says it stored the replacement', () => {
  const actor = readySettingsPlugin()
  actor.send({ type: 'SETTINGS.REPLACE', data: {} })

  actor.send({ type: 'SETTINGS_SAVED' })

  expect(replacement(actor)).toEqual({ status: 'saved', problems: [] })
})

it("is refused with the store's reasons, and a later save starts over", () => {
  const actor = readySettingsPlugin()
  actor.send({ type: 'SETTINGS.REPLACE', data: {} })

  actor.send({ type: 'SETTINGS_REFUSED', problems: ['"extra" isn\'t a settings section'] })
  expect(replacement(actor)).toEqual({ status: 'refused', problems: ['"extra" isn\'t a settings section'] })

  actor.send({ type: 'SETTINGS.REPLACE', data: {} })
  expect(replacement(actor)).toEqual({ status: 'saving', problems: [] })
})
