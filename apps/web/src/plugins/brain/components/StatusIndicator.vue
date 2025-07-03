<template>
  <div class="relative inline-flex items-center justify-center">
    <div 
      v-if="status === 'active'"
      class="absolute inset-0 rounded-full animate-ping"
      :class="pingClasses"
    />
    <div 
      class="relative w-2 h-2 rounded-full"
      :class="dotClasses"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  status: 'active' | 'paused' | 'completed' | 'failed';
}

const props = defineProps<Props>();

const dotClasses = computed(() => {
  switch (props.status) {
    case 'active':
      return 'bg-green-500';
    case 'paused':
      return 'bg-yellow-500';
    case 'completed':
      return 'bg-green-500';
    case 'failed':
      return 'bg-red-500';
    default:
      return 'bg-neutral-500';
  }
});

const pingClasses = computed(() => {
  switch (props.status) {
    case 'active':
      return 'bg-green-500 opacity-75';
    default:
      return '';
  }
});
</script> 