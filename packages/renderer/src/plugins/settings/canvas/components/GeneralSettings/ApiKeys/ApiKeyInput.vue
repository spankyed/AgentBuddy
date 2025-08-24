<template>
  <div class="group">
    <label :for="`${config.provider}-key`" class="block text-xs font-medium text-neutral-400 uppercase tracking-wider mb-2">
      {{ config.label }}
    </label>
    <div class="flex gap-2 max-w-md">
      <input
        :id="`${config.provider}-key`"
        v-model="localValue"
        :type="isVisible ? 'text' : 'password'"
        :placeholder="config.placeholder"
        @input="handleInput"
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
    <p class="mt-1.5 text-xs text-neutral-600">
      {{ config.description }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { Eye, EyeOff } from 'lucide-vue-next'
import type { ApiKeyConfig } from './types'

interface Props {
  config: ApiKeyConfig
  modelValue?: string
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'update:modelValue': [value: string]
  'save': [provider: string, value: string]
}>()

const localValue = ref(props.modelValue || '')
const isVisible = ref(false)

const toggleVisibility = () => {
  isVisible.value = !isVisible.value
}

const handleInput = () => {
  emit('update:modelValue', localValue.value)
}

watch(() => props.modelValue, (newValue) => {
  localValue.value = newValue || ''
})
</script>