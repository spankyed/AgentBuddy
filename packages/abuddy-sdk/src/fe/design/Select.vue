<template>
  <select
    :value="modelValue"
    @change="$emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
    class="appearance-none bg-[url('data:image/svg+xml;charset=UTF-8,%3csvg%20xmlns%3d%22http%3a%2f%2fwww.w3.org%2f2000%2fsvg%22%20width%3d%2214%22%20height%3d%228%22%20viewBox%3d%220%200%2014%208%22%3e%3cpath%20d%3d%22M1%201l6%206%206-6%22%20stroke%3d%22%239ca3af%22%20stroke-width%3d%222%22%20fill%3d%22none%22%20stroke-linecap%3d%22round%22%20stroke-linejoin%3d%22round%22%2f%3e%3c%2fsvg%3e')] bg-[length:14px_8px] bg-[position:right_0.75rem_center] bg-no-repeat pr-8"
    :class="[baseClass, customClass]"
  >
    <slot />
  </select>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  modelValue: string | number
  class?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string | number]
}>()

// Minimal base styling - just the essentials for the custom chevron
const baseClass = 'cursor-pointer focus:outline-none'

// Allow custom classes to be passed in for form-specific styling
const customClass = computed(() => props.class || '')
</script>