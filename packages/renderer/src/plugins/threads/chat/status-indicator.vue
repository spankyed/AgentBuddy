<template>
<!-- status indicator -->
<div
  v-if="stateConfig"
  class="flex items-center gap-2 mb-2 text-sm text-neutral-300 max-w-[80%]"
  :class="$style['status-indicator']">

  <!-- dot + glow -->
  <span class="relative inline-block">
    <!-- solid dot -->
    <span
      :class="[
        'block h-3 w-3 rounded-full transition-colors duration-300 ease-in-out',
        isAnimated ? $style['thinking-dot'] : ''
      ]"
      :style="!isAnimated ? { backgroundColor: stateConfig.color } : undefined"
    />
    <!-- glow -->
    <span
      :class="[
        'absolute inset-0 rounded-full scale-[2] transition-colors duration-300 ease-in-out',
        isAnimated ? $style['thinking-glow'] : 'blur-[1px] opacity-40'
      ]"
      :style="!isAnimated ? { backgroundColor: stateConfig.color } : undefined"
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
const settings = useSelector(actor, (state) => state.context.settings);
const chatStates = useSelector(actor, (state) => state.context.chatStates);
const overrides = useSelector(actor, (state) => state.context.chatStateOverrides);
const currentThread = useSelector(actor, (state) => state.context.currentThread);

const chatState = computed(() => chatStates.value[currentThread.value?.id ?? ''] || 'idle');

const stateConfig = computed(() => {
  const configs = settings.value?.chatStates;
  const threadId = currentThread.value?.id ?? '';
  const override = overrides.value[threadId];
  const activeId = (override && override.expiresAt > Date.now()) ? override.id : chatState.value;
  return configs?.find(c => c.id === activeId);
});

const isAnimated = computed(() => stateConfig.value?.colorful ?? false);
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
