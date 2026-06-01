<template>
  <div
    :class="[
      'flex-shrink-0 z-10 flex items-center justify-center transition-colors',
      isHorizontal
        ? 'h-full cursor-col-resize w-1.5'
        : 'w-full cursor-row-resize h-1.5',
      isDragging
        ? 'bg-neutral-600'
        : 'bg-neutral-800 hover:bg-neutral-700',
      isDragging && 'z-[1000]',
    ]"
    @mousedown="startDrag"
    @contextmenu="onContextMenu"
  >
    <div
      :class="[
        'rounded-full bg-neutral-500',
        isHorizontal
          ? 'h-8 w-px ml-px shadow-[-1px_0_0_rgba(255,255,255,0.15)]'
          : 'w-8 h-px shadow-[0_-1px_0_rgba(255,255,255,0.15)]',
      ]"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'

interface Props {
  orientation: 'horizontal' | 'vertical'
  min?: number
  max?: number
  collapsed?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  min: 200,
  max: Infinity,
  collapsed: false
})

const emit = defineEmits<{
  (e: 'resize', delta: number): void
  (e: 'click'): void
  (e: 'right-click'): void
}>()

const isHorizontal = computed(() => props.orientation === 'horizontal')

const DRAG_THRESHOLD = 3

const isDragging = ref(false)
let startPosition = 0
let startX = 0
let startY = 0
let clickIntent = true

const startDrag = (e: MouseEvent) => {
  if (e.button !== 0) return
  e.preventDefault()

  clickIntent = true
  startX = e.clientX
  startY = e.clientY
  startPosition = isHorizontal.value ? e.clientX : e.clientY

  document.addEventListener('mousemove', handleDrag)
  document.addEventListener('mouseup', stopDrag)
  document.body.style.cursor = isHorizontal.value ? 'col-resize' : 'row-resize'
  document.body.style.userSelect = 'none'
}

const handleDrag = (e: MouseEvent) => {
  const dx = Math.abs(e.clientX - startX)
  const dy = Math.abs(e.clientY - startY)

  if (clickIntent && dx < DRAG_THRESHOLD && dy < DRAG_THRESHOLD) return

  if (clickIntent) {
    clickIntent = false
    isDragging.value = true
  }

  const currentPosition = isHorizontal.value ? e.clientX : e.clientY
  const delta = currentPosition - startPosition

  emit('resize', delta)
  startPosition = currentPosition
}

const stopDrag = () => {
  document.removeEventListener('mousemove', handleDrag)
  document.removeEventListener('mouseup', stopDrag)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''

  if (clickIntent) {
    emit('click')
  }

  clickIntent = false
  isDragging.value = false
}

const onContextMenu = (e: MouseEvent) => {
  e.preventDefault()
  emit('right-click')
}

onUnmounted(() => {
  document.removeEventListener('mousemove', handleDrag)
  document.removeEventListener('mouseup', stopDrag)
})
</script>
