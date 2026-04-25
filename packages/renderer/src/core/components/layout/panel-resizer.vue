<template>
  <div
    :class="[
      'panel-resizer',
      `panel-resizer--${orientation}`,
      { 'panel-resizer--dragging': isDragging, 'panel-resizer--collapsed': collapsed }
    ]"
    @mousedown="startDrag"
    @contextmenu="onContextMenu"
  >
    <div class="panel-resizer__handle" />
  </div>
</template>

<script setup lang="ts">
import { ref, onUnmounted } from 'vue'

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

const DRAG_THRESHOLD = 3

const isDragging = ref(false)
let startPosition = 0
let startX = 0
let startY = 0
let clickIntent = true

const startDrag = (e: MouseEvent) => {
  if (e.button !== 0) return
  e.preventDefault()

  if (props.collapsed) {
    emit('click')
    return
  }

  clickIntent = true
  startX = e.clientX
  startY = e.clientY
  startPosition = props.orientation === 'horizontal' ? e.clientX : e.clientY

  document.addEventListener('mousemove', handleDrag)
  document.addEventListener('mouseup', stopDrag)
  document.body.style.cursor = props.orientation === 'horizontal' ? 'col-resize' : 'row-resize'
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

  const currentPosition = props.orientation === 'horizontal' ? e.clientX : e.clientY
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

// Suppress the browser context menu on the resizer and emit a simple
// `right-click` event. Callers can map it to whatever action fits.
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
.panel-resizer {
  position: relative;
  flex-shrink: 0;
  transition: background-color 0.2s;
  z-index: 10;
}

.panel-resizer--horizontal {
  width: 0;
  height: 100%;
  cursor: col-resize;
}

.panel-resizer--vertical {
  width: 100%;
  height: 3px;
  cursor: row-resize;
}

.panel-resizer__handle {
  position: absolute;
  background-color: transparent;
  transition: background-color 0.2s;
}

.panel-resizer--horizontal .panel-resizer__handle {
  top: 0;
  left: 0;
  right: -8px;
  bottom: 0;
}

.panel-resizer--horizontal.panel-resizer--collapsed .panel-resizer__handle {
  left: -8px;
  right: 0;
  pointer-events: none;
}

.panel-resizer--horizontal.panel-resizer--collapsed::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: -3px;
  right: 0;
  z-index: 12;
  cursor: col-resize;
}

.panel-resizer--vertical .panel-resizer__handle {
  left: 0;
  top: -4px;
  bottom: 0px;
  right: 0;
}

.panel-resizer:hover .panel-resizer__handle,
.panel-resizer--dragging .panel-resizer__handle {
  background-color: rgba(59, 130, 246, 0.5); /* Blue highlight */
}

.panel-resizer--dragging {
  z-index: 1000;
}

/* Ensure handle is also elevated */
.panel-resizer__handle {
  z-index: 11;
}
</style>
