// The settings a feature reads and changes of its own, without reaching into the view that draws them. The
// composables follow the settings for as long as the scope calling them lives, as useShell() does, and refuse to
// start outside a scope, where nothing would ever stop them.
import { afterEach, beforeEach, expect, it } from 'vitest'
import { effectScope } from 'vue'
import { updateSettings, useFeatureSettings, useSettingsSave, useSettingsSection } from '../../src/fe/settings.ts'
import { fakeSettings, type FakeSettings } from '../../src/testing/fake-settings.ts'
import { startFeTestRuntime } from '../../src/testing/fe-runtime.ts'
import { bindFeHost, unbindFeHost } from '../../src/runtime/fe-host.ts'
import type { FeatureRef } from '../../src/ids/index.ts'

const CODE = 'default-setup/code' as FeatureRef

let settings: FakeSettings

beforeEach(() => {
  settings = fakeSettings({ general: { projects: ['one'] }, plugins: { [CODE]: { mdEditorDefault: true } } })
  bindFeHost({ application: {} as never, secrets: {} as never, settings, client: {} as never, packs: {} as never })
})
afterEach(() => unbindFeHost())

/** Runs `body` in a scope, as a component's setup does, and returns it with the scope that holds it */
function inScope<T>(body: () => T): { value: T; stop: () => void } {
  const scope = effectScope()
  const value = scope.run(body)!
  return { value, stop: () => scope.stop() }
}

it('reads a registered section, and follows it', () => {
  const { value: general, stop } = inScope(() => useSettingsSection<{ projects: string[] }>('general'))
  expect(general.value).toEqual({ projects: ['one'] })

  settings.set({ general: { projects: ['one', 'two'] } })
  expect(general.value).toEqual({ projects: ['one', 'two'] })

  stop()
  settings.set({ general: { projects: [] } })
  expect(general.value).toEqual({ projects: ['one', 'two'] }) // the scope is gone; nothing follows it any more
})

it("reads a feature's own settings, and follows them", () => {
  const { value: code, stop } = inScope(() => useFeatureSettings<{ mdEditorDefault: boolean }>(CODE))
  expect(code.value).toEqual({ mdEditorDefault: true })

  settings.update({ feature: CODE }, ['mdEditorDefault'], false)
  expect(code.value).toEqual({ mdEditorDefault: false })

  stop()
})

it('reads undefined for a section no pack registered, rather than throwing', () => {
  const { value, stop } = inScope(() => useSettingsSection('nothing-registers-this'))
  expect(value.value).toBeUndefined()
  stop()
})

it('changes a section and a feature at the address the caller named', () => {
  const { value: save, stop } = inScope(() => useSettingsSave())

  save.update({ section: 'general' }, ['projects'], ['three'])
  save.update({ feature: CODE }, ['cliPaths', 'gh'], '/opt/bin/gh')

  expect(settings.updates).toEqual([
    { target: { section: 'general' }, path: ['projects'], value: ['three'] },
    { target: { feature: CODE }, path: ['cliPaths', 'gh'], value: '/opt/bin/gh' },
  ])
  expect(settings.section('general')).toEqual({ projects: ['three'] })
  expect(settings.feature(CODE)).toEqual({ mdEditorDefault: true, cliPaths: { gh: '/opt/bin/gh' } })
  stop()
})

it('follows whether the store stored the last change, so a form says Saved only then', () => {
  const { value: { save }, stop } = inScope(() => useSettingsSave())
  expect(save.value).toEqual({ status: 'idle', problems: [] })

  settings.answer({ status: 'refused', problems: ['not a ref'] })
  expect(save.value).toEqual({ status: 'refused', problems: ['not a ref'] })
  stop()
})

// A machine's action has no scope, so it changes settings without following them
it('changes settings from outside a scope, and refuses to follow them there', () => {
  updateSettings({ section: 'general' }, ['projects'], [])
  expect(settings.updates).toHaveLength(1)

  expect(() => useSettingsSection('general')).toThrow('runs in a component or an effect scope')
  expect(() => useFeatureSettings(CODE)).toThrow('runs in a component or an effect scope')
  expect(() => useSettingsSave()).toThrow('runs in a component or an effect scope')
})

// A test that reads settings it never said anything about can't know what it asserts, so the stand-in says where
// the usable one is instead of answering with an empty document
it('names fakeSettings when a test reaches for settings it did not pass', () => {
  unbindFeHost()
  const stopRuntime = startFeTestRuntime()

  expect(() => inScope(() => useSettingsSection('general')))
    .toThrow('pass settings: fakeSettings({ … }) from @abuddy/sdk/testing to startFeTestRuntime')

  stopRuntime()
})
