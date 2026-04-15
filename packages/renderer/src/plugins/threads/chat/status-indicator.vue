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
      isAnimated ? $style['thinking-dot'] : dotClass
    ]" />
    <!-- glow -->
    <span
      :class="[
        'absolute inset-0 rounded-full scale-[2] transition-colors duration-300 ease-in-out',
        isAnimated ? $style['thinking-glow'] : ['blur-[1px] opacity-40', dotClass]
      ]"
    />
  </span>
</div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { applicationState } from '@/main'
import { useSelector } from '@xstate/vue'
import { id, type ThreadsState } from '@/plugins/threads/state';

const actor: ThreadsState = applicationState.system.get(id);
const chatStates = useSelector(actor, (state) => state.context.chatStates);
const currentThread = useSelector(actor, (state) => state.context.currentThread);

const chatState = computed(() => chatStates.value[currentThread.value?.id ?? ''] || 'idle');
const isAnimated = computed(() => chatState.value === 'working');
const dotClass = computed(() => {
  switch (chatState.value) {
    case 'working': return ''; // handled by thinking-dot animation
    case 'paused':  return 'bg-yellow-500';
    default:        return 'bg-zinc-500';
  }
});
</script>

<style lang="scss" module>
.status-indicator {
  position: absolute;
  top: -.4rem;
  left: -.4rem;
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
