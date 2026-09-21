// What the settings plugin offers other features: the settings as they change, and the one way to change them.
// Other features import this module, never the plugin's machine.
import { onUnmounted, ref, type Ref } from 'vue'
import { useSelector } from '@xstate/vue'
import { pluginHandle } from '@/features/plugin-handle'
import { pluginSettings } from '@/features/settings/plugin-settings'
import type { GeneralSettings } from '@/__generated__/types'
import type { PluginName } from '@/__generated__/fe'
import type { SettingsState } from './state'

/** The settings plugin's actor, which its machine binds as it starts */
export const settingsPlugin = pluginHandle<SettingsState>('settings')

/** A plugin's settings, by the name this pack's code writes for it */
export function usePluginSettings<T = Record<string, any>>(name: PluginName): Readonly<Ref<T | undefined>> {
  return useSelector(settingsPlugin.get(), (state) => pluginSettings<T>(state.context.settings, name))
}

/** A section of the general settings (the user's projects, the application's) */
export function useGeneralSettings<K extends keyof GeneralSettings>(section: K): Readonly<Ref<GeneralSettings[K] | undefined>> {
  return useSelector(settingsPlugin.get(), (state) => state.context.settings?.general?.[section] as GeneralSettings[K] | undefined)
}

/** Changes a plugin's setting at `path` (the whole slice with an empty path) */
export function updatePluginSettings(name: PluginName, path: string[], value: unknown): void {
  settingsPlugin.get().send({ type: 'SETTINGS.UPDATE', entityType: 'plugin', label: name, path, value })
}

/** Changes a general setting at `path` in `section` (the whole section with an empty path) */
export function updateGeneralSettings(section: keyof GeneralSettings, path: string[], value: unknown): void {
  settingsPlugin.get().send({ type: 'SETTINGS.UPDATE', entityType: 'general', label: section, path, value })
}

/** A settings change with a status to show while it saves */
export function useSettingsSaveStatus() {
  const saveStatus = ref<'idle' | 'saving' | 'saved'>('idle')
  let saveTimeout: ReturnType<typeof setTimeout> | null = null

  const setSaveStatus = (status: 'saving' | 'saved') => {
    if (saveTimeout) clearTimeout(saveTimeout)
    saveStatus.value = status
    if (status === 'saved') {
      saveTimeout = setTimeout(() => {
        saveStatus.value = 'idle'
      }, 2000)
    }
  }

  const updateSettings = (params: { entityType: 'general' | 'plugin'; label: string; path: string[]; value: unknown }) => {
    setSaveStatus('saving')
    settingsPlugin.get().send({ type: 'SETTINGS.UPDATE', ...params })
    setSaveStatus('saved')
  }

  onUnmounted(() => {
    if (saveTimeout) clearTimeout(saveTimeout)
  })

  return { saveStatus, updateSettings, setSaveStatus }
}
