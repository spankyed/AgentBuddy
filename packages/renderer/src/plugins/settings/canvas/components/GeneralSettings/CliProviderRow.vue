<template>
  <div class="space-y-2">
    <!-- Provider Info (slot) -->
    <div>
      <slot />
    </div>

    <!-- Input + Test Button row -->
    <div class="flex items-center gap-3">
      <span class="text-xs text-neutral-500 shrink-0">Path</span>
      <input
        type="text"
        :value="modelValue"
        @input="emit('update:modelValue', ($event.target as HTMLInputElement).value.trim())"
        :placeholder="placeholder"
        class="w-full max-w-[400px] px-3 py-1.5 bg-neutral-800 border border-neutral-700/50 rounded-md text-white placeholder-neutral-600 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 hover:border-neutral-600 transition-all"
      />
      <div class="flex items-center gap-2">
        <button
          @click="emit('test')"
          :disabled="testResult === 'testing'"
          class="px-2.5 py-1 text-xs font-medium rounded-md transition-colors"
          :class="testResult === 'testing'
            ? 'bg-neutral-700 text-neutral-500 cursor-not-allowed'
            : 'bg-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-700 border border-neutral-700/50'"
          title="Test if CLI is available"
        >
          <Loader2
            v-if="testResult === 'testing'"
            class="w-3.5 h-3.5 animate-spin"
          />
          <span v-else>Test</span>
        </button>
        <CheckCircle
          v-if="testResult === 'success'"
          class="w-4 h-4 text-green-400"
        />
        <XCircle
          v-else-if="testResult === 'error'"
          class="w-4 h-4 text-red-400"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { CheckCircle, XCircle, Loader2 } from 'lucide-vue-next'

defineProps<{
  providerKey: string
  placeholder: string
  modelValue: string
  testResult: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'test': []
}>()
</script>
