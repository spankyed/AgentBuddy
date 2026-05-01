<template>
<Teleport to="body">
  <span v-if="statusLine && pos && isAnchorVisible"
    class="px-2 py-0.5 rounded-full bg-neutral-800 border border-neutral-700 text-[11px] text-neutral-500 font-mono truncate select-none cursor-pointer hover:text-neutral-300 hover:border-neutral-500 transition-colors"
    :style="pos"
    @click="emit('click')">
    {{ statusLine }}
  </span>
</Teleport>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useAnchorTracking } from './composables/useAnchorTracking'

const props = defineProps<{
  anchor?: HTMLElement | null
  statusLine?: string
}>()

const emit = defineEmits<{
  click: []
}>()

const pos = ref<Record<string, string> | null>(null)

const { isVisible: isAnchorVisible } = useAnchorTracking(
  () => props.anchor,
  (el) => {
    if (!props.statusLine) { pos.value = null; return }
    const r = el.getBoundingClientRect()
    if (r.height === 0) { pos.value = null; return }
    pos.value = {
      position: 'fixed',
      top: `${r.top - 10}px`,
      right: `${window.innerWidth - r.right - 8}px`,
      maxWidth: `${r.width * 0.6 + 16}px`,
      zIndex: '40',
    }
  },
  () => { pos.value = null },
)
</script>
