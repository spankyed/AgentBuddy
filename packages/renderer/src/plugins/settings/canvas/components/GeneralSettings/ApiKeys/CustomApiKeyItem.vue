<template>
  <div class="space-y-2">
    <div class="flex items-center gap-3">
      <!-- Event Name -->
      <div class="relative">
        <input
          v-model="localConfig.eventName"
          type="text"
          placeholder="EVENT_NAME"
          @input="handleUpdate"
          :class="[
            'w-48 px-3 py-2 bg-neutral-800 border rounded-lg text-white placeholder-neutral-600 text-sm font-mono uppercase focus:outline-none focus:ring-2 transition-all',
            eventNameError ? 'border-red-500/50 focus:ring-red-500/20 focus:border-red-500/50' : 'border-neutral-700/50 focus:ring-blue-500/20 focus:border-blue-500/50 hover:border-neutral-600'
          ]"
        />
      </div>
      
      <!-- Display Name -->
      <input
        v-model="localConfig.name"
        type="text"
        placeholder="Display name"
        @input="handleUpdate"
        class="flex-1 px-3 py-2 bg-neutral-800 border border-neutral-700/50 rounded-lg text-white placeholder-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 hover:border-neutral-600 transition-all"
      />
      
      <!-- API Key Value -->
      <div class="flex gap-2 flex-1">
        <input
          v-model="localConfig.value"
          :type="isVisible ? 'text' : 'password'"
          placeholder="API key value"
          @input="handleValueUpdate"
          class="flex-1 px-3 py-2 bg-neutral-800 border border-neutral-700/50 rounded-lg text-white placeholder-neutral-600 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 hover:border-neutral-600 transition-all"
        />
        <button 
          @click="toggleVisibility"
          class="px-3 py-2 bg-neutral-800 border border-neutral-700/50 rounded-lg text-neutral-400 hover:text-neutral-200 hover:border-neutral-600 transition-all"
        >
          <Eye v-if="isVisible" class="w-4 h-4" />
          <EyeOff v-else class="w-4 h-4" />
        </button>
      </div>
      
      <!-- Remove Button -->
      <button
        @click="handleRemove"
        class="px-3 py-2 bg-neutral-800 border border-neutral-700/50 rounded-lg text-neutral-400 hover:text-red-400 hover:border-red-500/50 transition-all"
        title="Remove API key"
      >
        <X class="w-4 h-4" />
      </button>
    </div>
    
    <!-- Validation Error Message -->
    <div v-if="eventNameError" class="text-xs text-red-400 ml-2">
      {{ eventNameError }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch, computed } from 'vue'
import { Eye, EyeOff, X } from 'lucide-vue-next'
import type { CustomApiKeyConfig } from './types'

interface Props {
  config: CustomApiKeyConfig
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'update': [config: CustomApiKeyConfig]
  'update-value': [config: CustomApiKeyConfig]
  'remove': []
}>()

const localConfig = reactive({ ...props.config })
const isVisible = ref(false)

// Validation
const eventNameError = computed(() => {
  if (!localConfig.eventName) return ''
  const regex = /^[A-Z][A-Z0-9_]*$/
  if (!regex.test(localConfig.eventName)) {
    return 'Must be uppercase with underscores (e.g., MY_API_KEY)'
  }
  return ''
})

const toggleVisibility = () => {
  isVisible.value = !isVisible.value
}

const handleUpdate = () => {
  emit('update', { ...localConfig })
}

const handleValueUpdate = () => {
  emit('update-value', { ...localConfig })
}

const handleRemove = () => {
  emit('remove')
}

watch(() => props.config, (newConfig) => {
  Object.assign(localConfig, newConfig)
}, { deep: true })
</script>