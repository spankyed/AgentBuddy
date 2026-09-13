import { ref, onUnmounted } from 'vue'
import { useActorSystem } from './actor-system.js'
import { getDesignated } from '../designations/index.js'

export function useSettingsSaveStatus() {
  const saveStatus = ref<'idle' | 'saving' | 'saved'>('idle')
  let saveTimeout: NodeJS.Timeout | null = null

  const system = useActorSystem()
  const settingsActor = system.get(getDesignated('settings'))

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
    entityType: string
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
