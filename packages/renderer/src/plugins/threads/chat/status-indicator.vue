<template>
<!-- status indicator -->
<div
  class="flex items-center gap-2 mb-2 text-sm text-neutral-300 max-w-[80%]"
  :class="$style['status-indicator']">

  <!-- dot + glow -->
  <span class="relative inline-block">
    <!-- solid dot -->
    <span :class="[
      'block h-3 w-3 rounded-full transition-colors duration-300 ease-in-out',
      isThinking ? $style['thinking-dot'] : statusColorClass
    ]" />
    <!-- glow -->
    <span
      :class="[
        'absolute inset-0 rounded-full scale-[2] transition-colors duration-300 ease-in-out',
        isThinking ? $style['thinking-glow'] : ['blur-[1px] opacity-40', statusColorClass]
      ]"
    />
  </span>
</div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, computed } from 'vue'
import ChatMessage from './message.vue'
import ChatInput from './input.vue'
import { applicationState } from '@/main'
import { useSelector } from '@xstate/vue'
import { id, type ThreadsState } from '@/plugins/threads/state';

const actor: ThreadsState = applicationState.system.get(id);
const messages = useSelector(actor, (state) => state.context.currentThread?.messages || []);

// const statusColorClass = computed(() => {
//   switch (status.value) {
//     case 'running':   return 'bg-green-500'
//     case 'planning':  return 'bg-blue-500'
//     case 'idle':      return 'bg-zinc-400'
//     case 'error':     return 'bg-red-500'
//     default:          return 'bg-gray-500'
//   }
// })
// const statusColorClass = computed(() => 'bg-green-500')
// const statusColorClass = computed(() => 'bg-purple-700/80')
// Use the statusColor from the state machine
const statusColorClass = useSelector(actor, (state) => state.context.statusColor)

const isThinking = computed(() => statusColorClass.value === 'bg-yellow-500')
</script>

<style lang="scss" module>
.status-indicator {
  position: absolute;
  top: -.4rem;                        // nudge so halo sits half outside the border
  left: -.4rem;                        // nudge so halo sits half outside the border
}

.thinking-dot {
  background: conic-gradient(
    from var(--thinking-angle, 0deg),
    #facc15,
    #a855f7,
    #3b82f6,
    #facc15
  );
  animation: thinking-rotate 3s linear infinite;
  filter: saturate(1.5) brightness(1.2);
}

.thinking-glow {
  background: conic-gradient(
    from var(--thinking-angle, 0deg),
    #facc15,
    #a855f7,
    #3b82f6,
    #facc15
  );
  animation: thinking-rotate 3s linear infinite;
  filter: blur(4px) saturate(2) brightness(1.3);
  opacity: 0.7;
}

@keyframes thinking-rotate {
  to {
    --thinking-angle: 360deg;
  }
}
</style>

<style>
@property --thinking-angle {
  syntax: '<angle>';
  initial-value: 0deg;
  inherits: false;
}
</style>
