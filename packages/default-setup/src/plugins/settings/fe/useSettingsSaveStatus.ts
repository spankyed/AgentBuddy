import { ref, onUnmounted } from 'vue'
import { getDesignatedPlugin } from '@abuddy/sdk/fe'
import { useActorSystem } from '@abuddy/sdk/fe'
import type { SETTINGS_SCOPE } from '@/registries/types'

export function useSettingsSaveStatus() {
  const saveStatus = ref<'idle' | 'saving' | 'saved'>('idle')
  let saveTimeout: NodeJS.Timeout | null = null

  const system = useActorSystem()
  const settingsActor = system.get(getDesignatedPlugin('settings'))

  const setSaveStatus = (status: 'saving' | 'saved') => {
    if (saveTimeout) {
      clearTimeout(saveTimeout)
    }

    saveStatus.value = status

    if (status === 'saved') {
      saveTimeout = setTimeout(() => {
        saveStatus.value = 'idle'
      }, 2000)
    }
  }

  const updateSettings = (params: {
    entityType: SETTINGS_SCOPE
    label: string
    path: string[]
    value: any
  }) => {
    setSaveStatus('saving')

    settingsActor.send({
      type: 'SETTINGS.UPDATE',
      ...params
    })

    setSaveStatus('saved')
  }

  onUnmounted(() => {
    if (saveTimeout) {
      clearTimeout(saveTimeout)
    }
  })

  return {
    saveStatus,
    updateSettings,
    setSaveStatus
  }
}
