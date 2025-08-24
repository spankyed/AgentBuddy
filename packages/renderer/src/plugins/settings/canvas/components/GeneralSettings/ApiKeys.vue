<!-- This component is now a simple wrapper that uses the refactored ApiKeysManager -->
<template>
  <ApiKeysManager 
    :settings="settings" 
    @update-setting="handleUpdateSetting"
  />
</template>

<script setup lang="ts">
import ApiKeysManager from './ApiKeys/ApiKeysManager.vue'

interface Props {
  settings?: any
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update-setting': [{
    path: string[]
    value: any
  }]
}>()

const handleUpdateSetting = (data: { path: string[], value: any }) => {
  emit('update-setting', data)
}
</script>