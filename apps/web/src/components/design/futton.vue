<template>
  <button
    :type="props.type ?? 'button'"
    :disabled="props.disabled"
    :class="[baseClasses, variantClasses, props.class]"
    @click="$emit('click', $event)"
    @contextmenu="$emit('contextmenu', $event)"
    @touchend="$emit('touchend', $event)"
    @touchstart.passive="$emit('touchstart', $event)">
    <slot />
  </button>
</template>


<script setup lang="ts">
import { computed } from 'vue'

defineEmits<{
  (e: 'click', event: Event): void;
  (e: 'contextmenu', event: Event): void;
  (e: 'touchend', event: Event): void;
  (e: 'touchstart', event: Event): void;
}>();

const props = defineProps<{
  variant?: 'primary' | 'secondary' | 'transparent'
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
  class?: string
}>()

const baseClasses = 'px-4 py-2 h-7 rounded text-sm font-medium transition-colors flex items-center gap-2'

const variantClasses = computed(() => {
  if (props.disabled) {
    // return 'bg-gray-500 text-neutral-300 cursor-not-allowed'
    switch (props.variant) {
      case 'secondary':
        return 'bg-gray-500 text-gray-800 cursor-not-allowed'
      case 'transparent':
        return 'bg-transparent text-neutral-500 cursor-not-allowed'
      default:
        return 'bg-primary-700 text-neutral-400 cursor-not-allowed'
    }
  }
  switch (props.variant) {
    case 'secondary':
      return 'bg-gray-300 text-gray-800 hover:bg-gray-200 active:bg-primary-400'
    case 'transparent':
      return 'bg-transparent text-neutral-200 hover:bg-neutral-700 hover:text-white'
    default:
      return 'bg-primary-500 text-white hover:bg-primary-400 active:bg-primary-600'
  }
})
</script> 