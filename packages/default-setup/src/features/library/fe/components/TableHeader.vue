<template>
  <th
    class="px-6 py-2 cursor-pointer hover:text-neutral-300"
    @click="$emit('click')"
  >
    <div class="flex items-center gap-2 whitespace-nowrap">
      <slot />
      <ArrowUp v-if="active && sortDirection === 'asc'" class="w-3 h-3" />
      <ArrowDown v-else-if="active && sortDirection === 'desc'" class="w-3 h-3" />
      <ArrowUpDown v-else class="w-3 h-3 opacity-50" />
    </div>
  </th>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-vue-next'

const props = defineProps<{
  column: string
  sortBy: string
  sortDirection: string
}>()

defineEmits<{
  click: []
}>()

const active = computed(() => props.column === props.sortBy)
</script>
