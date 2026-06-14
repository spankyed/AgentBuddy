<template>
  <div class="relative flex-shrink-0" :title="name">
    <img :src="src"
      class="w-20 h-20 object-cover rounded-lg border border-neutral-700/40 cursor-pointer hover:opacity-80 transition-opacity"
      @click="$emit('click')" />
    <div class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-neutral-900 from-40% to-transparent border-x border-b border-neutral-700/40 rounded-b-lg text-[11px] text-neutral-400 truncate text-center px-1.5 py-0.5 pointer-events-none">{{ name?.replace(/\.[^.]+$/, '') }}</div>
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
