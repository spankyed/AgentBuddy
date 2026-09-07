<template>
  <div class="flex items-center gap-2 mr-2 text-xs text-gray-500 dark:text-gray-400">
    <CircleDot class="w-3 h-3" />
    <span>{{ nodes }} {{ nodes === 1 ? 'node' : 'nodes' }}</span>
    
    <Link2 class="w-3 h-3 ml-1" />
    <span>{{ edges }} {{ edges === 1 ? 'edge' : 'edges' }}</span>
  </div>
</template>

<script setup lang="ts">
import { CircleDot, Link2 } from 'lucide-vue-next';

interface Props {
  nodes: number;
  edges: number;
}

defineProps<Props>();
</script> 