<template>
  <Teleport to="body">
    <div
      v-if="show"
      ref="menuElRef"
      class="fixed z-50 bg-neutral-800 border border-neutral-700 rounded-md shadow-lg py-1 min-w-[140px]"
      :style="{ left: `${pos.x}px`, top: `${pos.y}px` }"
    >
      <button
        v-for="item in items"
        :key="item.label"
        class="w-full flex items-center gap-2 text-left px-3 py-1.5 text-sm hover:bg-neutral-700 transition-colors"
        :class="item.class"
        @click="item.action(); $emit('close')"
      >
        <component :is="item.icon" :size="14" class="shrink-0" :class="item.iconClass || 'text-neutral-500'" />
        {{ item.label }}
      </button>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import type { MenuItem } from '@/core/composables/useContextMenu'
import { onMenuOpenChange } from '@/core/composables/useMenuState'

const props = defineProps<{
  show: boolean
  pos: { x: number; y: number }
  items: MenuItem[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const menuElRef = ref<HTMLDivElement | null>(null)

function handleClickOutside(e: MouseEvent) {
  if (menuElRef.value && !menuElRef.value.contains(e.target as Node)) {
    emit('close')
  }
}

onMounted(() => document.addEventListener('mousedown', handleClickOutside))
onUnmounted(() => document.removeEventListener('mousedown', handleClickOutside))

watch(() => props.show, (val) => onMenuOpenChange(val))
</script>
