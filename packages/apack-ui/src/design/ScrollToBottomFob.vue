<template>
  <button
    v-if="visible"
    class="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 flex items-center justify-center w-8 h-8 rounded-full bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white drop-shadow-lg transition-all cursor-pointer opacity-80 hover:opacity-100"
    @click="$emit('click')"
  >
    ↓
  </button>
</template>

<script setup lang="ts">
defineProps<{ visible: boolean }>()
defineEmits<{ click: [] }>()
</script>
