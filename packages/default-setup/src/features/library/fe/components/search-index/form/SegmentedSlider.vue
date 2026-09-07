<template>
  <div class="flex gap-2">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      @click="selectValue(option.value)"
      class="flex-1 px-3 py-2 text-sm font-medium rounded-md border transition-colors"
      :class="[
        modelValue === option.value
          ? 'bg-neutral-700 border-neutral-600 text-neutral-100'
          : 'bg-neutral-800/30 border-neutral-700/50 text-neutral-400 hover:bg-neutral-800/50'
      ]"
    >
      {{ option.label }}
    </button>
  </div>
</template>

<script setup lang="ts">
interface SliderOption {
  value: number
  label: string
}

const props = defineProps<{
  modelValue: number
  options: SliderOption[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: number]
}>()

function selectValue(value: number) {
  emit('update:modelValue', value)
}
</script>