<template>
  <DialogRoot v-model:open="isOpen">
    <DialogPortal>
      <DialogOverlay class="lightbox-overlay" />
      <DialogContent class="lightbox-content" aria-describedby="">
        <DialogTitle class="sr-only">Image preview</DialogTitle>

        <img
          :src="imageSrc"
          class="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
          @contextmenu.prevent="handleContextMenu"
        />

      </DialogContent>

      <button v-if="isOpen" class="lightbox-close" @click="isOpen = false">
        <X :size="20" />
      </button>
    </DialogPortal>
  </DialogRoot>

  <Teleport to="body">
    <div
      v-if="showMenu"
      ref="menuRef"
      class="pointer-events-auto fixed z-[60] bg-neutral-800 border border-neutral-700 rounded-md shadow-lg py-1 min-w-[140px]"
      :style="{ left: `${menuPos.x}px`, top: `${menuPos.y}px` }"
    >
      <button
        v-for="item in contextMenuItems"
        :key="item.label"
        class="w-full flex items-center gap-2 text-left px-3 py-1.5 text-sm hover:bg-neutral-700 transition-colors"
        :class="item.class"
        @click="item.action(); showMenu = false"
      >
        <component :is="item.icon" :size="14" class="shrink-0" :class="item.iconClass || 'text-neutral-500'" />
        {{ item.label }}
      </button>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  DialogRoot,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogTitle,
} from 'reka-ui'
import { X, Copy, Download } from 'lucide-vue-next'
import { useContextMenu, type MenuItem } from '@/core/composables/useContextMenu'

const props = defineProps<{
  modelValue: boolean
  imageSrc: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const isOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const { showMenu, menuRef, menuPos, open } = useContextMenu()

function handleContextMenu(e: MouseEvent) {
  open(e, 2)
}

const contextMenuItems = computed<MenuItem[]>(() => [
  {
    label: 'Copy image',
    icon: Copy,
    class: 'text-neutral-200',
    action: async () => {
      try {
        const response = await fetch(props.imageSrc)
        const blob = await response.blob()
        await navigator.clipboard.write([
          new ClipboardItem({ [blob.type]: blob })
        ])
      } catch (error) {
        console.error('Failed to copy image:', error)
      }
    }
  },
  {
    label: 'Download image',
    icon: Download,
    class: 'text-neutral-200',
    action: () => {
      const a = document.createElement('a')
      a.href = props.imageSrc
      a.download = 'image.png'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    }
  }
])
</script>

<style scoped>
.lightbox-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.9);
  z-index: 50;
  animation: overlayShow 150ms cubic-bezier(0.16, 1, 0.3, 1);
}

.lightbox-content {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 51;
  display: flex;
  align-items: center;
  justify-content: center;
  outline: none;
  animation: contentShow 150ms cubic-bezier(0.16, 1, 0.3, 1);
}

.lightbox-close {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 52;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  color: #e0e0e0;
  cursor: pointer;
  pointer-events: auto;
  transition: all 0.2s;
}

.lightbox-close:hover {
  background: rgba(0, 0, 0, 0.8);
  border-color: rgba(255, 255, 255, 0.3);
  color: #fff;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}

@keyframes overlayShow {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes contentShow {
  from {
    opacity: 0;
    transform: translate(-50%, -48%) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
}
</style>
