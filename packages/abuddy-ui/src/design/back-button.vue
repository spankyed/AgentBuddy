<template>
  <button
    @click="handleClick"
    type="button"
    class="p-1 text-neutral-400 transition-all duration-200 rounded hover:text-neutral-100 hover:bg-neutral-800"
    :aria-label="ariaLabel"
    :title="title"
  >
    <ChevronLeft class="w-5 h-5" />
  </button>
</template>

<script setup lang="ts">
import { ChevronLeft } from 'lucide-vue-next'

interface Props {
  ariaLabel?: string
  title?: string
}

withDefaults(defineProps<Props>(), {
  ariaLabel: 'Back to list',
  title: 'Back to list'
})

const emit = defineEmits<{
  click: [event: MouseEvent]
}>()

const handleClick = (event: MouseEvent) => {
  emit('click', event)
}
</script>