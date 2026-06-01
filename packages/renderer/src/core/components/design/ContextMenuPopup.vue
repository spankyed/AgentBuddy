<template>
  <Teleport to="body">
    <div
      v-if="show"
      ref="menuElRef"
      class="fixed z-50 bg-neutral-800 border border-neutral-700 rounded-md shadow-lg py-1 min-w-[140px]"
      :style="{ left: `${pos.x}px`, top: `${pos.y}px` }"
    >
      <template v-for="(item, i) in items" :key="item.label">
        <button
          class="w-full flex items-center gap-2 text-left px-3 py-1.5 text-sm hover:bg-neutral-700 transition-colors"
          :class="item.class"
          @click="item.action(); !item.keepOpen && $emit('close')"
        >
          <component :is="item.icon" :size="14" class="shrink-0" :class="item.iconClass || 'text-neutral-500'" />
          {{ item.label }}
        </button>
        <hr v-if="i === separatorAfter" class="my-1 border-neutral-700" />
      </template>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, toRef, onMounted, onUnmounted } from 'vue'
import type { MenuItem } from '@/core/composables/useContextMenu'
import { useTrackedMenuOpen } from '@/core/composables/useMenuState'

const props = withDefaults(defineProps<{
  show: boolean
  pos: { x: number; y: number }
  items: MenuItem[]
  separatorAfter?: number
}>(), {
  separatorAfter: -1,
})

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

useTrackedMenuOpen(toRef(props, 'show'))
</script>
