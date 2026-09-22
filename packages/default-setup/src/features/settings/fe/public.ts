// What the settings plugin offers other features: the settings as they change, and the one way to change them.
// Other features import this module, never the plugin's machine.
import { onUnmounted, ref, watch, type Ref } from 'vue'
import { useSelector } from '@xstate/vue'
import { pluginHandle } from '@/features/plugin-handle'
import { pluginSettings } from '@/features/settings/plugin-settings'
import type { GeneralSettings } from '@/__generated__/types'
import type { PluginName } from '@/__generated__/fe'
import type { SettingsSave, SettingsState, SettingsTarget } from './state'
import { ref as featureRef } from '@/__generated__/ref'

/** The settings plugin's actor, which its machine binds as it starts */
export const settingsPlugin = pluginHandle<SettingsState>('settings')

/** A plugin's settings, by the name this pack's code writes for it */
export function usePluginSettings<T = Record<string, any>>(name: PluginName): Readonly<Ref<T | undefined>> {
  return useSelector(settingsPlugin.get(), (state) => pluginSettings<T>(state.context.settings, name))
}

/** A plugin's settings as they apply now, for code outside a component (a machine's action) */
export function currentPluginSettings<T = Record<string, any>>(name: PluginName): T | undefined {
  return pluginSettings<T>(settingsPlugin.get().getSnapshot().context.settings, name)
}

/** A section of the general settings (the user's projects, the application's) */
export function useGeneralSettings<K extends keyof GeneralSettings>(section: K): Readonly<Ref<GeneralSettings[K] | undefined>> {
  return useSelector(settingsPlugin.get(), (state) => state.context.settings?.general?.[section] as GeneralSettings[K] | undefined)
}

/** Changes a plugin's setting at `path` (the whole slice with an empty path) */
export function updatePluginSettings(name: PluginName, path: string[], value: unknown): void {
  settingsPlugin.get().send({ type: 'SETTINGS.UPDATE', entityType: 'plugin', label: featureRef(name), path, value })
}

/** Changes a general setting at `path` in `section` (the whole section with an empty path) */
export function updateGeneralSettings(section: keyof GeneralSettings, path: string[], value: unknown): void {
  settingsPlugin.get().send({ type: 'SETTINGS.UPDATE', entityType: 'general', label: section, path, value })
}

/** How long a form shows "Saved" after the store stored a change */
const SAVED_SHOWN_MS = 2000

/**
 * A settings change, with the store's answer to the last one: `saving` until it answers, then `saved`, which clears
 * itself, or `refused` with the store's reasons. A form shows "Saved" only for a change the store stored.
 */
export function useSettingsSaveStatus() {
  const save = useSelector(settingsPlugin.get(), (state) => state.context.save)
  const saveStatus = ref<SettingsSave['status']>(save.value.status)
  const problems = ref<string[]>(save.value.problems)
  let clearSaved: ReturnType<typeof setTimeout> | null = null

  watch(save, (answer) => {
    saveStatus.value = answer.status
    problems.value = answer.problems
    if (clearSaved) clearTimeout(clearSaved)
    if (answer.status === 'saved') clearSaved = setTimeout(() => { saveStatus.value = 'idle' }, SAVED_SHOWN_MS)
  })

  /** A plugin's settings are named by their key (`featureRef(name)`, or a registered plugin's ref) */
  const updateSettings = (params: SettingsTarget & { path: string[]; value: unknown }) => {
    settingsPlugin.get().send({ type: 'SETTINGS.UPDATE', ...params })
  }

  onUnmounted(() => {
    if (clearSaved) clearTimeout(clearSaved)
  })

  return { saveStatus, problems, updateSettings }
}
