<template>
  <Transition
    enter-active-class="transition-all duration-200"
    enter-from-class="opacity-0 translate-y-2"
    enter-to-class="opacity-100 translate-y-0"
    leave-active-class="transition-all duration-200"
    leave-from-class="opacity-100 translate-y-0"
    leave-to-class="opacity-0 translate-y-2"
  >
    <div
      v-if="visible"
      class="absolute bottom-4 right-4 px-3 py-2 bg-neutral-800 border border-neutral-700 text-neutral-200 text-xs rounded-lg shadow-lg z-50 flex items-center gap-2"
    >
      <Check class="w-3 h-3 text-green-400" />
      <span>{{ message }}</span>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { Check } from 'lucide-vue-next'

interface Props {
  show: boolean
  message?: string
  duration?: number
}

const props = withDefaults(defineProps<Props>(), {
  message: 'Copied to clipboard',
  duration: 2000
})

const visible = ref(false)
let timeoutId: ReturnType<typeof setTimeout> | null = null

watch(() => props.show, (newValue) => {
  if (newValue) {
    visible.value = true
    
    // Clear any existing timeout
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
    
    // Hide after duration
    timeoutId = setTimeout(() => {
      visible.value = false
    }, props.duration)
  }
}, { immediate: true })
</script>