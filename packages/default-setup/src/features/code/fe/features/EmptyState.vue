<template>
  <div class="flex flex-col items-center pt-16 px-6 text-center gap-3">
    <div class="w-10 h-10 rounded-xl bg-neutral-800/80 flex items-center justify-center">
      <component :is="icon" class="w-5 h-5 text-neutral-500" />
    </div>
    <div>
      <p class="text-sm text-neutral-400">{{ title }}</p>
      <p v-if="subtitle" class="text-xs text-neutral-600 mt-0.5 max-w-xs">{{ subtitle }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Component } from 'vue'

defineProps<{
  icon: Component
  title: string
  subtitle?: string
}>()
</script>
