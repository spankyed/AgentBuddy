<template>
  <div class="overflow-y-auto h-full">
    <div 
      v-for="event in events" 
      :key="event.id"
      class="group cursor-pointer hover:bg-neutral-700/30 transition-all duration-150"
      :class="{ 
        'animate-pulse-event': pulsingEventTag === event.eventTag,
        'opacity-60': pulsingEventTag && pulsingEventTag !== event.eventTag
      }"
      @click="$emit('event-click', event.eventTag)"
    >
      <div class="px-4 py-3 border-b border-neutral-700/50">
        <div class="flex items-center justify-between">
          <div class="flex-1">
            <div class="text-sm font-medium text-neutral-200 mb-1">
              {{ event.label }}
            </div>
            <div class="flex items-center gap-2 text-xs text-neutral-400">
              <span class="font-mono">{{ event.eventTag }}</span>
              <span>•</span>
              <span class="capitalize">{{ event.mode }}</span>
            </div>
          </div>
          <svg 
            class="w-4 h-4 text-neutral-500 group-hover:text-neutral-300 transition-colors"
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path 
              stroke-linecap="round" 
              stroke-linejoin="round" 
              stroke-width="2" 
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
        </div>
      </div>
    </div>
    
    <div v-if="events.length === 0" class="p-4 text-center text-neutral-500">
      No event listeners in this flow
    </div>
  </div>
</template>

<script setup lang="ts">
import type { EventListenerEntity } from '@abuddy/api/systems/brain/types';

interface Props {
  events: EventListenerEntity[];
  pulsingEventTag?: string;
}

defineProps<Props>();

defineEmits<{
  'event-click': [eventTag: string];
}>();
</script>

<style scoped>
@keyframes pulse-event {
  0% {
    opacity: 0.2;
    background-color: rgba(59, 130, 246, 0.1);
  }
  50% {
    opacity: 1;
    background-color: rgba(59, 130, 246, 0.2);
  }
  100% {
    opacity: 0.6;
    background-color: transparent;
  }
}

.animate-pulse-event {
  animation: pulse-event 400ms ease-in-out;
}
</style> 