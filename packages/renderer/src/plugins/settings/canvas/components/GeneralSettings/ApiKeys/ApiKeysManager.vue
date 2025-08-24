<template>
  <div class="max-w-3xl">
    <!-- Header Section -->
    <div class="mb-8">
      <h2 class="text-xl font-semibold text-white mb-2">API Keys</h2>
      <p class="text-sm text-neutral-500">
        Configure your API keys used to authenticate with external services. These keys are securely encrypted and stored locally.
      </p>
    </div>
    
    <!-- Form Fields -->
    <div class="space-y-6">
      <!-- Built-in API Keys -->
      <ApiKeyInput
        v-for="(config, key) in builtInProviders"
        :key="key"
        :config="config"
        v-model="apiKeyValues[key]"
        @update:model-value="(value) => handleBuiltInUpdate(key, value)"
      />
      
      <!-- Divider -->
      <div class="border-t border-neutral-800"></div>
      
      <!-- Custom API Keys Section -->
      <CustomApiKeysSection
        :custom-keys="customKeys"
        @add="handleAddCustomKey"
        @update="handleUpdateCustomKey"
        @update-value="handleUpdateCustomKeyValue"
        @remove="handleRemoveCustomKey"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { useDebounce } from '@/core/composables/useDebounce'
import { trpc } from '@/core/trpc'
import ApiKeyInput from './ApiKeyInput.vue'
import CustomApiKeysSection from './CustomApiKeysSection.vue'
import { BUILT_IN_PROVIDERS, type CustomApiKeyConfig } from './types'

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

// State
const builtInProviders = BUILT_IN_PROVIDERS
const apiKeyValues = reactive({
  google: '',
  anthropic: '',
  openai: ''
})

const customKeys = ref<CustomApiKeyConfig[]>(
  props.settings?.custom?.map((key: any) => ({
    ...key,
    value: ''
  })) || []
)

// Handlers for built-in API keys
const { debounced: handleBuiltInUpdate } = useDebounce(async (provider: string, value: string) => {
  if (!value || value.trim().length === 0) {
    return
  }
  
  try {
    await trpc.bus.send.mutate({
      systemId: 'settings',
      type: 'UPDATE_API_KEY',
      provider,
      value: value.trim()
    })
    // Clear the value for security
    apiKeyValues[provider as keyof typeof apiKeyValues] = ''
  } catch (error) {
    console.error(`Failed to update ${provider} API key:`, error)
    // Could emit an error event here for UI feedback
  }
}, 1000)

// Handlers for custom API keys
const handleAddCustomKey = () => {
  const newKey: CustomApiKeyConfig = {
    id: `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name: '',
    eventName: '',
    value: ''
  }
  customKeys.value.push(newKey)
}

const handleUpdateCustomKey = (index: number, config: CustomApiKeyConfig) => {
  customKeys.value[index] = config
  saveCustomKeysMetadata()
}

const { debounced: handleUpdateCustomKeyValue } = useDebounce(async (config: CustomApiKeyConfig) => {
  // Validate inputs
  if (!config.value?.trim() || !config.eventName?.trim() || !config.name?.trim()) {
    return
  }
  
  // Validate event name format (uppercase letters, numbers, underscores only)
  const eventNameRegex = /^[A-Z][A-Z0-9_]*$/
  if (!eventNameRegex.test(config.eventName)) {
    console.error('Event name must be uppercase with underscores only (e.g., MY_API_KEY)')
    return
  }
  
  try {
    await trpc.bus.send.mutate({
      systemId: 'settings',
      type: 'CREATE_CUSTOM_API_KEY',
      name: config.name.trim(),
      eventName: config.eventName.trim(),
      value: config.value.trim(),
      description: config.description?.trim()
    })
    // Clear the value for security
    const index = customKeys.value.findIndex(k => k.id === config.id)
    if (index >= 0) {
      customKeys.value[index].value = ''
    }
  } catch (error) {
    console.error('Failed to create/update custom API key:', error)
  }
}, 1000)

const handleRemoveCustomKey = (index: number) => {
  const key = customKeys.value[index]
  if (key.id) {
    trpc.bus.send.mutate({
      systemId: 'settings',
      type: 'DELETE_CUSTOM_API_KEY',
      id: key.id
    })
  }
  customKeys.value.splice(index, 1)
}

const saveCustomKeysMetadata = () => {
  const metadata = customKeys.value
    .filter(k => k.eventName && k.name)
    .map(k => ({
      id: k.id,
      name: k.name,
      eventName: k.eventName,
      description: k.description
    }))
  
  emit('update-setting', {
    path: ['custom'],
    value: metadata
  })
}
</script>