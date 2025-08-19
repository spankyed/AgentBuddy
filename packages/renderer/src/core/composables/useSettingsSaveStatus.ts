import { ref, onUnmounted } from 'vue'
import { applicationState } from '@/main'

/**
 * Composable for managing settings save status with automatic timeout
 * Provides a consistent UX for all settings components
 */
export function useSettingsSaveStatus() {
  const saveStatus = ref<'idle' | 'saving' | 'saved'>('idle')
  let saveTimeout: NodeJS.Timeout | null = null
  
  const settingsActor = applicationState.system.get('settings')
  
  /**
   * Set the save status with automatic timeout for 'saved' state
   */
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
  
  /**
   * Update settings with automatic save status management
   */
  const updateSettings = (params: {
    entityType: 'general' | 'plugin'
    label: string
    path: string[]
    value: any
  }) => {
    setSaveStatus('saving')
    
    settingsActor.send({
      type: 'SETTINGS.UPDATE',
      ...params
    })
    
    // Set to saved after sending
    // In the future, this could listen for a confirmation event
    setSaveStatus('saved')
  }
  
  // Cleanup timeout on component unmount
  onUnmounted(() => {
    if (saveTimeout) {
      clearTimeout(saveTimeout)
    }
  })
  
  return {
    saveStatus,
    updateSettings,
    setSaveStatus // Export for cases where manual control is needed
  }
}