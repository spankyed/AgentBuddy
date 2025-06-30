<template>
  <div class="h-full overflow-y-auto">
    <div 
      v-for="event in events" 
      :key="event.id"
      class="group cursor-pointer hover:bg-white/[0.03] transition-all duration-200"
      :class="{ 
        'animate-pulse-event': pulsingEventType === event.eventType,
        'opacity-50': pulsingEventType && pulsingEventType !== event.eventType
      }"
      @click="$emit('event-click', event.eventType)"
    >
      <div class="px-3 py-2.5 border-b border-neutral-800/50">
        <div class="flex items-center justify-between gap-3">
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium text-neutral-100 mb-0.5 truncate">
              {{ event.label }}
            </div>
            <div class="flex items-center gap-2 text-xs text-neutral-500">
              <span class="font-mono">{{ event.eventType }}</span>
              <span class="text-neutral-600">•</span>
              <span class="capitalize">{{ event.mode }}</span>
            </div>
          </div>
          <div class="flex items-center justify-center flex-shrink-0 w-5 h-5 transition-all duration-200 rounded bg-purple-500/10 group-hover:bg-purple-500/15">
            <svg 
              class="w-3.5 h-3.5 text-purple-400 transition-colors"
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
    </div>
    
    <div v-if="events.length === 0" class="flex flex-col items-center justify-center h-48 px-4 text-center">
      <div class="flex items-center justify-center w-12 h-12 mb-3">
        <svg class="w-6 h-6 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      </div>
      <p class="text-sm text-neutral-400">No event listeners in this flow</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { EventListenerEntity } from '@abuddy/api';

interface Props {
  events: EventListenerEntity[];
  pulsingEventType?: string;
}

defineProps<Props>();

defineEmits<{
  'event-click': [eventType: string];
}>();
</script>

<style scoped>
@keyframes pulse-event {
  0% {
    opacity: 0.8;
    background-color: rgba(139, 92, 246, 0.05);
  }
  50% {
    opacity: 1;
    background-color: rgba(139, 92, 246, 0.1);
  }
  100% {
    opacity: 0.8;
    background-color: transparent;
  }
}

.animate-pulse-event {
  animation: pulse-event 400ms ease-in-out;
}
</style> 