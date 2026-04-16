<template>
<Teleport to="body">
  <div
    v-if="stateConfig && pos && isAnchorVisible"
    class="flex items-center gap-2 text-sm text-neutral-300 max-w-[80%] pointer-events-none"
    :class="$style['status-indicator']"
    :style="positionStyle"
  >
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
</Teleport>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { applicationState } from '@/main'
import { useSelector } from '@xstate/vue'
import { id, type ThreadsState } from '@/plugins/threads/state';

const props = defineProps<{
  anchor?: HTMLElement | null
}>()

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

const isAnimated = computed(() => stateConfig.value?.busy ?? false);

// Live position tracking — the indicator is teleported to <body> with
// position: fixed so it can render outside the chat area's overflow tree.
// A rAF loop keeps it pinned to the anchor's top-left on every layout change
// (attachments, panel resize, window resize, etc.) — trivial cost for one node.
const pos = ref<{ top: number; left: number } | null>(null)

const positionStyle = computed(() => pos.value && ({
  position: 'fixed' as const,
  top: `${pos.value.top}px`,
  left: `${pos.value.left}px`,
  zIndex: 50,
}))

function updatePos() {
  const el = props.anchor
  if (!el) { pos.value = null; return }
  const r = el.getBoundingClientRect()
  // Match the original -0.4rem (-6.4px) offsets so the dot keeps its
  // exact on-screen placement above the input card's top-left corner.
  pos.value = { top: r.top - 6.4, left: r.left - 6.4 }
}

let rafId: number | null = null
function tick() {
  updatePos()
  rafId = requestAnimationFrame(tick)
}

// Gate rendering on the anchor's *effective* visibility — IntersectionObserver
// walks every ancestor's clip/containing block, so when any overflow:hidden
// parent clips the anchor out (e.g. chat panel minimized via double-click
// resizer), we hide the teleported dot instead of leaving it stranded at the
// anchor's now-invisible coordinates.
//
// TODO: revisit when a chat-MAXIMIZED state lands. If maximize introduces a
// different DOM branch or animated transition for the chat area, re-verify
// that the IntersectionObserver still fires correctly across the transition
// (test: maximize → minimize → maximize; ensure no stuck/ghost dot), and that
// the rAF position-tracking stays accurate at the new anchor position.
const isAnchorVisible = ref(false)
let io: IntersectionObserver | null = null

function observeAnchor(el: HTMLElement | null | undefined) {
  io?.disconnect()
  io = null
  isAnchorVisible.value = false
  if (!el) return
  io = new IntersectionObserver(
    ([entry]) => { isAnchorVisible.value = entry.isIntersecting },
    { threshold: 0 },
  )
  io.observe(el)
}

watch(() => props.anchor, (el) => observeAnchor(el ?? null), { immediate: true })

onMounted(() => { tick() })
onBeforeUnmount(() => {
  io?.disconnect()
  if (rafId != null) cancelAnimationFrame(rafId)
})
</script>

<style lang="scss" module>
.status-indicator {
  // Positioning lives on the element's inline :style — fixed to the input
  // card's top-left via the anchor prop so the dot renders outside the chat
  // area's overflow-clipped tree.
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
