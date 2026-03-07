<template>
<!-- status indicator -->
<div
  class="flex items-center gap-2 mb-2 text-sm text-neutral-300 max-w-[80%]"
  :class="$style['status-indicator']">

  <!-- dot + glow -->
  <span class="relative inline-block">
    <!-- solid dot -->
    <span :class="['block h-3 w-3 rounded-full transition-colors duration-300 ease-in-out', statusColorClass]" />
    <!-- glow -->
    <span
      :class="[
        'absolute inset-0 rounded-full scale-[2] blur-[1px] opacity-40 transition-colors duration-300 ease-in-out',
        statusColorClass
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
import { id, type AgentState } from '@/plugins/agent/state';

const actor: AgentState = applicationState.system.get(id);
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
</script>

<style lang="scss" module>
.status-indicator {
  position: absolute;
  top: -.4rem;                        // nudge so halo sits half outside the border
  left: -.4rem;                        // nudge so halo sits half outside the border
}
</style>
