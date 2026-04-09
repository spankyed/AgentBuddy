<template>
  <DialogRoot v-model:open="isOpen">
    <DialogPortal>
      <DialogOverlay class="lightbox-overlay" />
      <DialogContent class="lightbox-content" aria-describedby="" @interact-outside="onInteractOutside">
        <DialogTitle class="sr-only">Image preview</DialogTitle>

        <div class="lightbox-image-wrapper">
          <img
            :src="imageSrc"
            class="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
            @contextmenu.prevent="handleContextMenu"
          />

          <button class="lightbox-close" @click="isOpen = false">
            <X :size="18" />
          </button>
        </div>

      </DialogContent>
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
import { X, Copy, Download, ExternalLink } from 'lucide-vue-next'
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

function onInteractOutside(event: Event) {
  if (showMenu.value) {
    event.preventDefault()
  }
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
  },
  {
    label: 'Open in default app',
    icon: ExternalLink,
    class: 'text-neutral-200',
    action: async () => {
      try {
        await window.electronAPI?.shell?.openExternal(props.imageSrc)
      } catch (error) {
        console.error('Failed to open image externally:', error)
      }
    }
  }
])
</script>

<style scoped>
.lightbox-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.8);
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

.lightbox-image-wrapper {
  position: relative;
  display: inline-block;
}

.lightbox-close {
  position: absolute;
  top: -12px;
  right: -12px;
  z-index: 52;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 50%;
  color: #e0e0e0;
  cursor: pointer;
  pointer-events: auto;
  transition: all 0.2s;
}

.lightbox-close:hover {
  background: rgba(0, 0, 0, 0.9);
  border-color: rgba(255, 255, 255, 0.3);
  color: #fff;
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
