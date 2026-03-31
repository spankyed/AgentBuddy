<template>
  <div class="relative flex-shrink-0">
    <img :src="src"
      class="w-20 h-20 object-cover rounded-lg border border-neutral-700 cursor-pointer hover:opacity-80 transition-opacity"
      @click="$emit('click')" />
    <div class="absolute bottom-0 left-0 right-0 bg-black/60 text-[10px] text-neutral-200 truncate text-center px-1 py-0.5 rounded-b-lg">{{ name }}</div>
    <slot />
  </div>
</template>

<script setup lang="ts">
defineProps<{
  src: string
  name: string
}>()

defineEmits<{
  (e: 'click'): void
}>()
</script>
