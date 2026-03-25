<template>
  <th 
    class="px-6 py-2 cursor-pointer hover:text-neutral-300" 
    @click="$emit('click')"
  >
    <div class="flex items-center gap-2 whitespace-nowrap">
      <slot />
      <ArrowUpDown class="w-3 h-3 opacity-50" />
    </div>
  </th>
</template>

<script setup lang="ts">
import { ArrowUpDown } from 'lucide-vue-next'

defineEmits<{
  click: []
}>()
</script>