<template>
<!-- status indicator -->
<div
  class="flex items-center gap-2 mb-2 text-sm text-neutral-300 max-w-[80%]"
  :class="$style['status-indicator']">

  <!-- dot + glow -->
  <span class="relative inline-block">
    <!-- solid dot -->
    <span :class="['block h-3 w-3 rounded-full', statusColorClass]" />
    <!-- glow -->
    <span
      :class="[
        'absolute inset-0 rounded-full scale-[2] blur-[1px] opacity-40',
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
import type { Message } from '@abuddy/api'
import { applicationState } from '@/app'
import { useSelector } from '@xstate/vue'
import { id, type AgentState } from '@/plugins/agent/state';

const actor: AgentState = applicationState.system.get(id);
const messages = useSelector(actor, (state) => state.context.messages)

// const statusLabel = computed(() => {
//   switch (status.value) {
//     case 'running':   return 'Running'
//     case 'planning':  return 'Planning'
//     case 'idle':      return 'Idle'
//     case 'error':     return 'Error'
//     default:          return 'Unknown'
//   }
// })
// const statusColorClass = computed(() => {
//   switch (status.value) {
//     case 'running':   return 'bg-green-500'
//     case 'planning':  return 'bg-blue-500'
//     case 'idle':      return 'bg-zinc-400'
//     case 'error':     return 'bg-red-500'
//     default:          return 'bg-gray-500'
//   }
// })
const statusLabel = computed(() => 'Running')
// const statusColorClass = computed(() => 'bg-green-500')
// const statusColorClass = computed(() => 'bg-purple-700/80')
const statusColorClass = computed(() => 'bg-zinc-500')
// const statusColorClass = computed(() => 'bg-blue-500')
// const statusColorClass = computed(() => 'bg-purple-500')
</script>

<style lang="scss" module>
.status-indicator {
  position: absolute;
  top: -.3rem;                        // nudge so halo sits half outside the border
  left: -.3rem;                        // nudge so halo sits half outside the border
}
</style> 