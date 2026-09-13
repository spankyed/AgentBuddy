<template>
  <div
    :class="[
      'flex-shrink-0 z-10 transition-colors',
      subtle
        ? ['panel-resizer--subtle relative', isHorizontal ? 'w-0 h-full cursor-col-resize' : 'h-[3px] w-full cursor-row-resize']
        : ['flex items-center justify-center', isHorizontal ? 'h-full cursor-col-resize w-1.5' : 'w-full cursor-row-resize h-1.5',
           isDragging ? 'bg-neutral-600' : 'bg-neutral-800 hover:bg-neutral-700'],
      isDragging && 'z-[1000]',
      isDragging && subtle && 'is-dragging',
    ]"
    @mousedown="startDrag"
    @contextmenu="onContextMenu"
  >
    <!-- Subtle: invisible handle, shows on hover/drag -->
    <div
      v-if="subtle"
      :class="[
        'panel-resizer__handle absolute z-[11] bg-transparent transition-colors',
        isHorizontal
          ? 'top-0 left-0 bottom-0 -right-2'
          : 'left-0 -top-1 bottom-0 right-0',
      ]"
    />
    <!-- Regular: visible pill indicator -->
    <div
      v-else
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
  subtle?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  min: 200,
  max: Infinity,
  collapsed: false,
  subtle: false
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

<style scoped>
.panel-resizer--subtle:hover .panel-resizer__handle,
.panel-resizer--subtle.is-dragging .panel-resizer__handle {
  background-color: rgb(82 82 82); /* neutral-600 */
}
</style>
